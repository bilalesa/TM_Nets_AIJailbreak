// backend/src/controllers/authController.ts
//
// Two-step signup:
//   1. POST /api/auth/start    { username, email }     -> sends 6-digit code
//   2. POST /api/auth/verify   { email, code }         -> issues JWT
//
// The JWT is only minted after the code is verified, so unverified accounts
// can never reach gameplay endpoints.

import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase.js';
import { sendVerificationEmail } from '../services/emailService.js';

const CODE_TTL_MINUTES = 15;
const MAX_VERIFY_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

function generateCode(): string {
  // 6 digits, leading zeros preserved.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

// Pull the client IP from the request. Express's `trust proxy` is on, so
// req.ip already resolves to the first X-Forwarded-For entry on Vercel/nginx.
function extractClientIp(req: Request): string | null {
  return req.ip || null;
}

// Caps the fingerprint we persist. Anything longer is almost certainly junk
// from a tampered client.
function sanitizeFingerprint(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 256);
}

export const startSession = async (req: Request, res: Response) => {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res
        .status(500)
        .json({ error: 'Server auth misconfigured: JWT_SECRET is missing' });
    }

    // username/email are already validated and normalized by middleware.
    const { username, email } = req.body as { username: string; email: string };
    const fingerprint = sanitizeFingerprint(
      (req.body as { fingerprint?: unknown }).fingerprint,
    );
    const registrationIp = extractClientIp(req);

    // Username must be free.
    const { data: usernameTaken, error: usernameError } = await supabase
      .from('players')
      .select('id')
      .eq('username', username)
      .maybeSingle();
    if (usernameError) throw usernameError;
    if (usernameTaken) {
      return res.status(409).json({
        error: 'That username is already taken. Please choose a different name.',
      });
    }

    // Email must be free OR belong to a not-yet-verified record we can recycle.
    const { data: existingByEmail, error: emailLookupError } = await supabase
      .from('players')
      .select('id, username, is_verified, verification_sent_at')
      .eq('email', email)
      .maybeSingle();
    if (emailLookupError) throw emailLookupError;

    if (existingByEmail?.is_verified) {
      return res
        .status(409)
        .json({ error: 'An account already exists for this email.' });
    }

    if (existingByEmail?.verification_sent_at) {
      const elapsed =
        Date.now() - new Date(existingByEmail.verification_sent_at).getTime();
      if (elapsed < RESEND_COOLDOWN_SECONDS * 1000) {
        const wait = Math.ceil(
          (RESEND_COOLDOWN_SECONDS * 1000 - elapsed) / 1000,
        );
        return res.status(429).json({
          error: `Please wait ${wait}s before requesting another code.`,
        });
      }
    }

    const code = generateCode();
    const expires = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);
    const sentAt = new Date();

    if (existingByEmail) {
      // Reuse the row; rotate the code, reset attempts, refresh origin metadata.
      const { error: updateError } = await supabase
        .from('players')
        .update({
          username,
          verification_code: code,
          verification_code_expires_at: expires.toISOString(),
          verification_attempts: 0,
          verification_sent_at: sentAt.toISOString(),
          registration_ip: registrationIp,
          client_fingerprint: fingerprint,
        })
        .eq('id', existingByEmail.id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase.from('players').insert({
        username,
        email,
        is_verified: false,
        session_active: true,
        registration_ip: registrationIp,
        client_fingerprint: fingerprint,
        verification_code: code,
        verification_code_expires_at: expires.toISOString(),
        verification_attempts: 0,
        verification_sent_at: sentAt.toISOString(),
      });
      if (insertError) throw insertError;
    }

    try {
      await sendVerificationEmail(email, code, username);
    } catch (sendError) {
      console.error('[startSession] sendVerificationEmail failed', sendError);
      return res.status(502).json({
        error: 'Could not send verification email. Please try again shortly.',
      });
    }

    return res.json({
      verificationRequired: true,
      email,
      expiresInSeconds: CODE_TTL_MINUTES * 60,
    });
  } catch (error: unknown) {
    console.error('[startSession]', error);
    return res.status(500).json({ error: 'Unable to start session right now.' });
  }
};

export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res
        .status(500)
        .json({ error: 'Server auth misconfigured: JWT_SECRET is missing' });
    }

    const { email, code } = req.body as { email?: unknown; code?: unknown };

    if (typeof email !== 'string' || typeof code !== 'string') {
      return res.status(400).json({ error: 'Email and code are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const trimmedCode = code.trim();

    if (!/^\d{6}$/.test(trimmedCode)) {
      return res.status(400).json({ error: 'Code must be 6 digits' });
    }

    const { data: player, error: lookupError } = await supabase
      .from('players')
      .select(
        'id, username, is_verified, verification_code, verification_code_expires_at, verification_attempts',
      )
      .eq('email', normalizedEmail)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (!player) {
      return res.status(404).json({ error: 'No pending verification for that email' });
    }

    if (player.is_verified) {
      return res.status(409).json({ error: 'Email is already verified' });
    }

    if (player.verification_attempts >= MAX_VERIFY_ATTEMPTS) {
      return res.status(429).json({
        error: 'Too many attempts. Request a new code.',
      });
    }

    if (
      !player.verification_code ||
      !player.verification_code_expires_at ||
      new Date(player.verification_code_expires_at).getTime() < Date.now()
    ) {
      return res.status(410).json({ error: 'Code expired. Request a new one.' });
    }

    // Constant-time comparison to avoid timing oracles on the code.
    const a = Buffer.from(trimmedCode);
    const b = Buffer.from(player.verification_code);
    const matches = a.length === b.length && crypto.timingSafeEqual(a, b);

    if (!matches) {
      await supabase
        .from('players')
        .update({ verification_attempts: player.verification_attempts + 1 })
        .eq('id', player.id);
      return res.status(401).json({ error: 'Invalid code' });
    }

    // Verified — clear the code and mint a JWT.
    const { error: updateError } = await supabase
      .from('players')
      .update({
        is_verified: true,
        verification_code: null,
        verification_code_expires_at: null,
        verification_attempts: 0,
      })
      .eq('id', player.id);
    if (updateError) throw updateError;

    const token = jwt.sign(
      { id: player.id, username: player.username },
      jwtSecret,
      { expiresIn: '24h' },
    );

    return res.json({ token, username: player.username });
  } catch (error: unknown) {
    console.error('[verifyEmail]', error);
    return res.status(500).json({ error: 'Verification failed.' });
  }
};
