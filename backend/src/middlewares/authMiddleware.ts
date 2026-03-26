import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

function getTokenFromCookieHeader(cookieHeader?: string): string | null {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';');
  for (const cookieEntry of cookies) {
    const [rawName, ...rawValueParts] = cookieEntry.trim().split('=');
    if (rawName === 'game_session_token') {
      const rawValue = rawValueParts.join('=');
      return rawValue ? decodeURIComponent(rawValue) : null;
    }
  }

  return null;
}

export const authenticateUser = (req: Request, res: Response, next: NextFunction) => {
  if (!JWT_SECRET) {
    return res.status(500).json({ error: 'Server auth misconfigured: JWT_SECRET is missing' });
  }

  const authHeader = req.headers.authorization;
  const bearerToken =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : null;
  const cookieToken = getTokenFromCookieHeader(req.headers.cookie);
  const token = bearerToken || cookieToken;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { username: string, id: string };
    // Attach the user to the request object so controllers can use it
    (req as any).user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};