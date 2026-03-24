import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase.js';

export const startSession = async (req: Request, res: Response) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Upsert player in Supabase
    const { data: player, error } = await supabase
      .from('players')
      .upsert({ username }, { onConflict: 'username' })
      .select()
      .single();

    if (error) throw error;

    // Sign the JWT with the DB UUID
    const token = jwt.sign(
      { id: player.id, username: player.username },
      process.env.JWT_SECRET!,
      { expiresIn: '24h' }
    );

    return res.json({ token, username: player.username });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};