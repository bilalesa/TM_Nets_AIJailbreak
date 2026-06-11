// backend/src/controllers/profileController.ts

import { Request, Response } from 'express';
import { pool } from '../config/supabase.js';

export const getPlayerProfile = async (req: Request, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'User context not found' });
    return;
  }

  try {
    const [playerRes, completionsRes] = await Promise.all([
      pool.query(
        'SELECT id, username, total_score, created_at FROM players WHERE id = $1 LIMIT 1',
        [user.id],
      ),
      pool.query(
        `SELECT stage_number, score_awarded, time_taken_seconds, completed_at
         FROM stage_completions
         WHERE player_id = $1
         ORDER BY stage_number ASC`,
        [user.id],
      ),
    ]);

    const playerRow = playerRes.rows[0] ?? null;
    if (!playerRow) {
      res.status(401).json({ error: 'Session expired', code: 'PLAYER_GONE' });
      return;
    }

    const completions = completionsRes.rows;

    res.json({
      player: playerRow,
      completedStages: completions.map((c: { stage_number: number }) => c.stage_number),
      completions,
    });
  } catch (err) {
    console.error('[profileController.getPlayerProfile]', err);
    res.status(500).json({ error: 'Failed to load player profile' });
  }
};

export const getStageHistory = async (req: Request, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'User context not found' });
    return;
  }

  const stageParam = req.query.stage;
  const stageNumber = Number.parseInt(String(stageParam ?? ''), 10);
  if (!Number.isInteger(stageNumber) || stageNumber < 1 || stageNumber > 5) {
    res.status(400).json({ error: 'Invalid stage' });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT id, prompt_text, ai_response, created_at
       FROM prompt_logs
       WHERE player_id = $1 AND stage_number = $2
       ORDER BY created_at ASC`,
      [user.id, stageNumber],
    );

    interface HistoryMessage {
      id: string;
      role: 'bot' | 'user';
      content: string;
      timestamp: number;
    }

    const messages: HistoryMessage[] = [];
    for (const row of result.rows) {
      const ts = new Date(row.created_at as string).getTime();
      messages.push({
        id: `pl-${row.id}-u`,
        role: 'user',
        content: (row.prompt_text as string) ?? '',
        timestamp: ts,
      });
      if (typeof row.ai_response === 'string' && row.ai_response.length > 0) {
        messages.push({
          id: `pl-${row.id}-b`,
          role: 'bot',
          content: row.ai_response,
          timestamp: ts + 1,
        });
      }
    }

    res.json({ messages });
  } catch (err) {
    console.error('[profileController.getStageHistory]', err);
    res.status(500).json({ error: 'Failed to load stage history' });
  }
};
