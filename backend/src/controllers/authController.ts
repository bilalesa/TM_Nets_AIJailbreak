// backend/src/controllers/authController.ts
//
// Auth flows:
//   POST /api/auth/start    { username }                    -> issues JWT
//                                                              + recoveryCode
//   POST /api/auth/recover  { username, recoveryCode }      -> issues JWT
//
// The recovery code is the only way to re-login on a different device or
// after a cookie expires — there is no email, no password reset, no support
// recovery. Code is generated server-side at signup, shown to the player
// exactly once in the response, and persisted only as a salted scrypt hash
// in players.recovery_code_hash.
//
// Email is no longer part of the schema (see migrations/2026_04_28_recovery_code.sql).

import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase.js';
import {
  generateRecoveryCode,
  hashRecoveryCode,
  verifyRecoveryCode,
} from '../utils/recoveryCode.js';

// Pull the client IP from the request. Express's `trust proxy` is on, so
// req.ip already resolves to the real client IP via X-Forwarded-For.
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

function signJwt(playerId: string, username: string): string {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is missing');
  }
  return jwt.sign({ id: playerId, username }, jwtSecret, { expiresIn: '24h' });
}

export const startSession = async (req: Request, res: Response) => {
  try {
    if (!process.env.JWT_SECRET) {
      return res
        .status(500)
        .json({ error: 'Server auth misconfigured: JWT_SECRET is missing' });
    }

    // username is already validated/normalized by middleware.
    const { username } = req.body as { username: string };
    const fingerprint = sanitizeFingerprint(
      (req.body as { fingerprint?: unknown }).fingerprint,
    );
    const registrationIp = extractClientIp(req);

    // Username must be free — there is no longer a "same email re-login"
    // path on this endpoint. Players who want to re-login must hit
    // /api/auth/recover with their saved recovery code.
    const { data: usernameTaken, error: usernameError } = await supabase
      .from('players')
      .select('id')
      .eq('username', username)
      .maybeSingle();
    if (usernameError) throw usernameError;
    if (usernameTaken) {
      return res.status(409).json({
        error:
          'That username is already taken. If this is your account, use the recovery code you saved at signup.',
      });
    }

    const recoveryCode = generateRecoveryCode();
    const recoveryCodeHash = hashRecoveryCode(recoveryCode);

    const { data: inserted, error: insertError } = await supabase
      .from('players')
      .insert({
        username,
        session_active: true,
        registration_ip: registrationIp,
        client_fingerprint: fingerprint,
        recovery_code_hash: recoveryCodeHash,
      })
      .select('id, username')
      .single();
    if (insertError) throw insertError;

    const token = signJwt(inserted.id, inserted.username);

    // recoveryCode is returned ONCE in this response. The plaintext is never
    // logged and never persisted.
    return res.json({
      token,
      username: inserted.username,
      recoveryCode,
    });
  } catch (error: unknown) {
    console.error('[startSession]', error);
    return res.status(500).json({ error: 'Unable to start session right now.' });
  }
};

export const recoverSession = async (req: Request, res: Response) => {
  try {
    if (!process.env.JWT_SECRET) {
      return res
        .status(500)
        .json({ error: 'Server auth misconfigured: JWT_SECRET is missing' });
    }

    const { username, recoveryCode } = req.body as {
      username: string;
      recoveryCode: string;
    };
    const fingerprint = sanitizeFingerprint(
      (req.body as { fingerprint?: unknown }).fingerprint,
    );

    if (typeof recoveryCode !== 'string' || !recoveryCode.trim()) {
      return res.status(400).json({ error: 'Recovery code is required' });
    }

    const { data: player, error: lookupError } = await supabase
      .from('players')
      .select('id, username, is_banned, banned_reason, recovery_code_hash')
      .eq('username', username)
      .maybeSingle();
    if (lookupError) throw lookupError;

    // Generic error message regardless of which branch fails — don't leak
    // which usernames exist in the database.
    const GENERIC_FAILURE = {
      status: 401 as const,
      body: { error: 'Username or recovery code is incorrect.' },
    };

    if (!player) {
      return res.status(GENERIC_FAILURE.status).json(GENERIC_FAILURE.body);
    }
    if (!verifyRecoveryCode(recoveryCode, player.recovery_code_hash)) {
      return res.status(GENERIC_FAILURE.status).json(GENERIC_FAILURE.body);
    }
    if (player.is_banned) {
      return res.status(403).json({
        error: player.banned_reason ?? 'This account has been banned.',
      });
    }

    const { error: refreshError } = await supabase
      .from('players')
      .update({
        session_active: true,
        last_active_at: new Date().toISOString(),
        client_fingerprint: fingerprint,
      })
      .eq('id', player.id);
    if (refreshError) throw refreshError;

    const token = signJwt(player.id, player.username);
    return res.json({ token, username: player.username });
  } catch (error: unknown) {
    console.error('[recoverSession]', error);
    return res.status(500).json({ error: 'Unable to recover session right now.' });
  }
};
