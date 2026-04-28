import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { NextFunction, Request, Response } from 'express';
import authRoutes from './routes/authRoutes.js';
import playerRoutes from './routes/playerRoutes.js';
import gameRoutes from './routes/gameRoutes.js';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT || 3001);
const requestTimeoutMs = Number(process.env.REQUEST_TIMEOUT_MS || 15000);
const headersTimeoutMs = Number(process.env.HEADERS_TIMEOUT_MS || 16000);
const keepAliveTimeoutMs = Number(process.env.KEEP_ALIVE_TIMEOUT_MS || 5000);
const gameplayRateLimitPerMin = Number(process.env.GAMEPLAY_RATE_LIMIT_PER_MIN || 120);
const configuredCorsOrigins = (process.env.CORS_ORIGINS || '')
	.split(',')
	.map((origin) => origin.trim())
	.filter(Boolean);

if (isProduction && configuredCorsOrigins.length === 0) {
	throw new Error('CORS_ORIGINS must be set in production (comma-separated list of allowed origins).');
}

const allowedOrigins =
	configuredCorsOrigins.length > 0
		? configuredCorsOrigins
		: ['http://localhost:3000', 'http://127.0.0.1:3000'];

const app = express();

app.disable('x-powered-by');
// Two trusted proxy hops in production:
//   client → Vercel edge (frontend rewrite) → nginx → express
// `trust proxy: 1` would only strip nginx, leaving req.ip resolved to the
// Vercel egress IP (a tiny pool — that's why audit views were showing the
// same 1–2 IPs for every player). Setting this to 2 walks back one more
// hop in X-Forwarded-For so req.ip is the real client address.
app.set('trust proxy', 2);

app.use(
	helmet({
		crossOriginResourcePolicy: { policy: 'cross-origin' },
		contentSecurityPolicy: {
			useDefaults: true,
			directives: {
				'default-src': ["'self'"],
				'frame-ancestors': ["'none'"],
			},
		},
		hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
		frameguard: { action: 'deny' },
	}),
);

app.use(
	cors({
		credentials: true,
		origin: (origin, callback) => {
			if (!origin || allowedOrigins.includes(origin)) {
				callback(null, true);
				return;
			}

			callback(new Error('Not allowed by CORS'));
		},
	}),
);

app.use(express.json({ limit: '20kb' }));

const authLimiter = rateLimit({
	windowMs: 10 * 60 * 1000,
	max: 40,
	standardHeaders: true,
	legacyHeaders: false,
});

const gameplayLimiter = rateLimit({
	windowMs: 60 * 1000,
	max: gameplayRateLimitPerMin,
	standardHeaders: true,
	legacyHeaders: false,
});

app.get('/health', (_req, res) => {
	res.status(200).send('OK');
});

// Register the routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/games', gameplayLimiter, gameRoutes);

app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
	if (error instanceof Error && error.message === 'Not allowed by CORS') {
		return res.status(403).json({ error: 'Origin not allowed' });
	}

	next(error);
});

app.use((_error: unknown, _req: Request, res: Response, _next: NextFunction) => {
	return res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
	console.log(`Server running on port ${PORT}`);
});

server.requestTimeout = requestTimeoutMs;
server.headersTimeout = headersTimeoutMs;
server.keepAliveTimeout = keepAliveTimeoutMs;

function shutdown(signal: string) {
	console.log(`[shutdown] received ${signal}, draining connections`);
	server.close(() => {
		console.log('[shutdown] server closed');
		process.exit(0);
	});

	setTimeout(() => {
		console.error('[shutdown] force exit after timeout');
		process.exit(1);
	}, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (error) => {
	console.error('[uncaughtException]', error);
});

process.on('unhandledRejection', (reason) => {
	console.error('[unhandledRejection]', reason);
});