// backend/src/controllers/authController.ts
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase.js';

export const startSession = async (req: Request, res: Response) => {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ error: 'Server auth misconfigured: JWT_SECRET is missing' });
    }

    const { username } = req.body;

    if (!username || typeof username !== 'string' || !username.trim()) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const trimmedUsername = username.trim();

    // ── Check for duplicate username ──────────────────────────────────────────
    // We do NOT upsert here — that would silently let a second person steal an
    // existing session. Instead we check first, then insert only if free.
    const { data: existing, error: lookupError } = await supabase
      .from('players')
      .select('id, username')
      .eq('username', trimmedUsername)
      .maybeSingle();

    if (lookupError) throw lookupError;

    let player: { id: string; username: string };

    if (existing) {
      // ── Username already taken ───────────────────────────────────────────────
      // Option A (current): block it — each player must be unique per session.
      // Option B (future): compare with a session_active flag or TTL if you want
      //   returning players to be able to re-join under the same name.
      return res.status(409).json({
        error: 'That username is already taken. Please choose a different name.',
      });
    }

    // ── Insert new player ────────────────────────────────────────────────────
    const { data: newPlayer, error: insertError } = await supabase
      .from('players')
      .insert({ username: trimmedUsername })
      .select()
      .single();

    if (insertError) throw insertError;

    player = newPlayer;

    // ── Sign the JWT ──────────────────────────────────────────────────────────
    const token = jwt.sign(
      { id: player.id, username: player.username },
      jwtSecret,
      { expiresIn: '24h' },
    );

    return res.json({ token, username: player.username });
  } catch (error: any) {
    console.error('[startSession]', error);
    return res.status(500).json({ error: error.message });
  }
};