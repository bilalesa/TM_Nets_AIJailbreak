// backend/src/controllers/validateCodeController.ts

import { Request, Response } from 'express';
import { pool } from '../config/supabase.js';
import { SERVER_STAGE_CONFIGS } from '../config/stageConfig.js';
import { deriveUserStageCode } from '../utils/stageCode.js';
import { hashPrompt } from '../utils/promptHash.js';

/**
 * Compute XP bonus from time: faster = more bonus XP (max 50% of baseXP).
 * Under 60s → full bonus (50% of base)
 * 60–300s  → linear decay
 * 300s+    → 0
 */
function computeTimeBonus(elapsedSeconds: number, baseXP: number): number {
  if (elapsedSeconds <= 60) return Math.round(baseXP * 0.5);
  if (elapsedSeconds >= 300) return 0;
  const ratio = 1 - (elapsedSeconds - 60) / 240;
  return Math.round(baseXP * 0.5 * ratio);
}

export const validateCode = async (req: Request, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'User context not found' });
    return;
  }

  try {
    const { stageNumber, code } = req.body as { stageNumber?: unknown; code?: unknown };

    if (!Number.isInteger(stageNumber)) {
      res.status(400).json({ error: 'Invalid stage' });
      return;
    }

    const parsedStageNumber = stageNumber as number;

    if (parsedStageNumber < 1 || parsedStageNumber > 5) {
      res.status(400).json({ error: 'Invalid stage' });
      return;
    }

    if (typeof code !== 'string' || !code.trim()) {
      res.status(400).json({ error: 'Code is required' });
      return;
    }

    // 1. Check double-submission
    const existingRes = await pool.query(
      `SELECT id, score_awarded FROM stage_completions
       WHERE player_id = $1 AND stage_number = $2
       LIMIT 1`,
      [user.id, parsedStageNumber],
    );
    const existing = existingRes.rows[0] ?? null;

    if (existing) {
      res.json({
        correct: true,
        alreadyCompleted: true,
        scoreAwarded: existing.score_awarded,
      });
      return;
    }

    // 2. Validate code
    const stageConfig = SERVER_STAGE_CONFIGS[parsedStageNumber - 1];
    const expectedCode = deriveUserStageCode(user.id, parsedStageNumber, stageConfig.secretCode);
    const isCorrect = code.trim().toUpperCase() === expectedCode.toUpperCase();

    if (!isCorrect) {
      res.json({ correct: false });
      return;
    }

    // 3. Get player fingerprint
    const requestingPlayerRes = await pool.query(
      'SELECT client_fingerprint FROM players WHERE id = $1 LIMIT 1',
      [user.id],
    );
    if ((requestingPlayerRes.rowCount ?? 0) === 0) {
      throw new Error('Player not found when fetching fingerprint');
    }
    const requestingFingerprint = requestingPlayerRes.rows[0]?.client_fingerprint ?? null;

    // 4. Get time started from first prompt log
    const submittedAt = new Date();
    const firstPromptRes = await pool.query(
      `SELECT created_at FROM prompt_logs
       WHERE player_id = $1 AND stage_number = $2
       ORDER BY created_at ASC
       LIMIT 1`,
      [user.id, parsedStageNumber],
    );
    const firstPromptRow = firstPromptRes.rows[0] ?? null;
    const startedAt = firstPromptRow?.created_at ? new Date(firstPromptRow.created_at) : submittedAt;

    // 5. Compute score
    const timeTakenSeconds = Math.max(
      0,
      Math.floor((submittedAt.getTime() - startedAt.getTime()) / 1000),
    );
    const timeBonus = computeTimeBonus(timeTakenSeconds, stageConfig.baseXP);
    const grossScore = stageConfig.baseXP + timeBonus;
    const scoreAwarded = grossScore;

    // 6. Insert stage completion
    await pool.query(
      `INSERT INTO stage_completions
         (player_id, stage_number, score_awarded, time_taken_seconds, started_at, submitted_at, client_fingerprint)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        user.id,
        parsedStageNumber,
        scoreAwarded,
        timeTakenSeconds,
        startedAt.toISOString(),
        submittedAt.toISOString(),
        requestingFingerprint,
      ],
    );

    // 7. Update player score
    await pool.query(
      `UPDATE players SET total_score = COALESCE(total_score, 0) + $2 WHERE id = $1`,
      [user.id, scoreAwarded],
    );

    // 8. Save cracked prompt (fire-and-forget)
    (async () => {
      try {
        const winningPromptRes = await pool.query(
          `SELECT prompt_text FROM prompt_logs
           WHERE player_id = $1 AND stage_number = $2 AND is_successful = true
           ORDER BY created_at DESC
           LIMIT 1`,
          [user.id, parsedStageNumber],
        );
        const winningPromptRow = winningPromptRes.rows[0] ?? null;
        const winningPrompt = winningPromptRow?.prompt_text?.trim();

        if (!winningPrompt) {
          console.warn(
            `[validateCode] No is_successful prompt found for player=${user.id} stage=${parsedStageNumber}; skipping anti-cheat save.`,
          );
          return;
        }

        const textHash = hashPrompt(winningPrompt);
        if (!textHash) {
          console.warn('[validateCode] Winning prompt normalized to empty string; skipping save.');
          return;
        }

        await pool.query(
          `INSERT INTO cracked_prompts (player_id, stage_number, prompt_text, text_hash)
           VALUES ($1, $2, $3, $4)`,
          [user.id, parsedStageNumber, winningPrompt, textHash],
        );
      } catch (err) {
        console.error('[validateCode] Failed to save winning prompt hash:', err);
      }
    })();

    // 9. Return result
    res.json({
      correct: true,
      scoreAwarded,
      grossScore,
      timeBonus,
      baseXP: stageConfig.baseXP,
    });
  } catch (err) {
    console.error('[validateCodeController]', err);
    res.status(500).json({ error: 'Failed to validate code' });
  }
};
