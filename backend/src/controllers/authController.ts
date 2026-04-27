// backend/src/controllers/authController.ts
//
// Single-step signup:
//   POST /api/auth/start  { username, email }  -> issues JWT immediately
//
// Email is captured for record-keeping with basic format validation, but no
// verification code is sent. Username + email must be unique.

import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase.js';

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

    // Email must be free.
    const { data: emailTaken, error: emailLookupError } = await supabase
      .from('players')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (emailLookupError) throw emailLookupError;
    if (emailTaken) {
      return res
        .status(409)
        .json({ error: 'An account already exists for this email.' });
    }

    const { data: inserted, error: insertError } = await supabase
      .from('players')
      .insert({
        username,
        email,
        session_active: true,
        registration_ip: registrationIp,
        client_fingerprint: fingerprint,
      })
      .select('id, username')
      .single();
    if (insertError) throw insertError;

    const token = jwt.sign(
      { id: inserted.id, username: inserted.username },
      jwtSecret,
      { expiresIn: '24h' },
    );

    return res.json({ token, username: inserted.username });
  } catch (error: unknown) {
    console.error('[startSession]', error);
    return res.status(500).json({ error: 'Unable to start session right now.' });
  }
};
