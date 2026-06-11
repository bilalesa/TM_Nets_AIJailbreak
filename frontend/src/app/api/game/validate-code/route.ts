// frontend/src/app/api/game/validate-code/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SERVER_STAGE_CONFIGS } from '@/lib/stageConfig';
import { deriveUserStageCode } from '@/lib/stageCode';
import { computeTimeBonus } from '@/lib/avatar';
import { hashPrompt } from '@/lib/promptHash';
import { pool } from '@/lib/db';
import { getPlayerFromCookie } from '@/lib/playerSession';

// Create a fresh Supabase client for Realtime broadcasts only (no DB access).
function getRealtimeClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

async function broadcastScoreUpdated(payload: {
  playerId: string;
  stageNumber: number;
  scoreAwarded: number;
}) {
  const supabase = getRealtimeClient();
  const channel = supabase.channel('leaderboard-updates');
  const safePayload = {
    playerId: payload.playerId,
    stageNumber: payload.stageNumber,
    scoreAwarded: payload.scoreAwarded,
    sentAt: new Date().toISOString(),
  };

  const maybeHttpSend = (
    channel as unknown as { httpSend?: (event: string, payload: unknown) => Promise<unknown> }
  ).httpSend;
  if (typeof maybeHttpSend === 'function') {
    return maybeHttpSend.call(channel, 'score_updated', safePayload);
  }

  return channel.send({
    type: 'broadcast' as const,
    event: 'score_updated',
    payload: safePayload,
  });
}

export async function POST(request: NextRequest) {
  try {
    // 1. Auth — validates JWT AND confirms player still exists
    const session = await getPlayerFromCookie();
    if (!session.ok) return session.response;
    const { player } = session;

    // 2. Parse body
    const { stageNumber, code } = (await request.json()) as {
      stageNumber?: unknown;
      code?: unknown;
    };

    if (!Number.isInteger(stageNumber)) {
      return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });
    }

    const parsedStageNumber = stageNumber as number;

    if (parsedStageNumber < 1 || parsedStageNumber > 5) {
      return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });
    }

    if (typeof code !== 'string' || !code.trim()) {
      return NextResponse.json({ error: 'Code is required' }, { status: 400 });
    }

    // 3. Prevent double-submission
    const existingRes = await pool.query(
      `SELECT id, score_awarded FROM stage_completions
       WHERE player_id = $1 AND stage_number = $2
       LIMIT 1`,
      [player.id, parsedStageNumber],
    );
    const existing = existingRes.rows[0] ?? null;

    if (existing) {
      return NextResponse.json({
        correct: true,
        alreadyCompleted: true,
        scoreAwarded: existing.score_awarded,
      });
    }

    // 4. Validate code (case-insensitive, trimmed)
    const stageConfig = SERVER_STAGE_CONFIGS[parsedStageNumber - 1];
    const expectedCode = deriveUserStageCode(player.id, parsedStageNumber, stageConfig.secretCode);
    const isCorrect = code.trim().toUpperCase() === expectedCode.toUpperCase();

    if (!isCorrect) {
      return NextResponse.json({ correct: false });
    }

    // 4b. Snapshot the player's current fingerprint for audit
    const requestingPlayerRes = await pool.query(
      'SELECT client_fingerprint FROM players WHERE id = $1 LIMIT 1',
      [player.id],
    );
    if (requestingPlayerRes.rowCount === 0) {
      throw new Error('Player not found when fetching fingerprint');
    }
    const requestingFingerprint = requestingPlayerRes.rows[0]?.client_fingerprint ?? null;

    // 5. Derive started_at from MIN(prompt_logs.created_at) for this player+stage.
    const submittedAt = new Date();
    const firstPromptRes = await pool.query(
      `SELECT created_at FROM prompt_logs
       WHERE player_id = $1 AND stage_number = $2
       ORDER BY created_at ASC
       LIMIT 1`,
      [player.id, parsedStageNumber],
    );
    const firstPromptRow = firstPromptRes.rows[0] ?? null;

    const startedAt = firstPromptRow?.created_at ? new Date(firstPromptRow.created_at) : submittedAt;
    const timeTakenSeconds = Math.max(
      0,
      Math.floor((submittedAt.getTime() - startedAt.getTime()) / 1000),
    );

    // 6. Compute score: baseXP + time bonus
    const timeBonus = computeTimeBonus(timeTakenSeconds, stageConfig.baseXP);
    const grossScore = stageConfig.baseXP + timeBonus;
    const scoreAwarded = grossScore;

    // 7. Record completion
    await pool.query(
      `INSERT INTO stage_completions
         (player_id, stage_number, score_awarded, time_taken_seconds, started_at, submitted_at, client_fingerprint)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        player.id,
        parsedStageNumber,
        scoreAwarded,
        timeTakenSeconds,
        startedAt.toISOString(),
        submittedAt.toISOString(),
        requestingFingerprint,
      ],
    );

    // 8. Update total_score on the player row (increment)
    await pool.query(
      `UPDATE players SET total_score = COALESCE(total_score, 0) + $2 WHERE id = $1`,
      [player.id, scoreAwarded],
    );

    // 10. Anti-cheat: save the actual cracking prompt for copy-paste detection.
    (async () => {
      try {
        const winningPromptRes = await pool.query(
          `SELECT prompt_text FROM prompt_logs
           WHERE player_id = $1 AND stage_number = $2 AND is_successful = true
           ORDER BY created_at DESC
           LIMIT 1`,
          [player.id, parsedStageNumber],
        );
        const winningPromptRow = winningPromptRes.rows[0] ?? null;
        const winningPrompt = winningPromptRow?.prompt_text?.trim();

        if (!winningPrompt) {
          console.warn(
            `[validate-code] No is_successful prompt found for player=${player.id} stage=${parsedStageNumber}; skipping anti-cheat save.`,
          );
          return;
        }

        const textHash = hashPrompt(winningPrompt);
        if (!textHash) {
          console.warn('[validate-code] Winning prompt normalized to empty string; skipping save.');
          return;
        }

        await pool.query(
          `INSERT INTO cracked_prompts (player_id, stage_number, prompt_text, text_hash)
           VALUES ($1, $2, $3, $4)`,
          [player.id, parsedStageNumber, winningPrompt, textHash],
        );
      } catch (err) {
        // Non-fatal — don't let the anti-cheat save block the win.
        console.error('[validate-code] Failed to save winning prompt hash:', err);
      }
    })();

    // 11. Broadcast score_updated event to Supabase Realtime
    broadcastScoreUpdated({ playerId: player.id, stageNumber: parsedStageNumber, scoreAwarded })
      .then(() => {})
      .catch((err: unknown) => console.warn('[broadcast score_updated]', err));

    return NextResponse.json({
      correct: true,
      scoreAwarded,
      grossScore,
      timeBonus,
      baseXP: stageConfig.baseXP,
    });
  } catch (error: unknown) {
    console.error('[/api/game/validate-code]', error);
    return NextResponse.json({ error: 'Failed to validate code' }, { status: 500 });
  }
}
