// frontend/src/app/api/game/validate-code/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Validates the secret code a player submits for a stage.
// - Checks the code server-side (never exposed to client)
// - If correct, records the stage completion + awards XP
// - Updates the player's total_score
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { SERVER_STAGE_CONFIGS } from '@/lib/stageConfig';
import { deriveUserStageCode } from '@/lib/stageCode';
import { computeTimeBonus } from '@/lib/avatar';
import { embedText, saveWinningPrompt } from '@/lib/embeddings';
import { getSupabaseServerClient } from '@/lib/supabaseClient';

const supabase = getSupabaseServerClient();

async function broadcastScoreUpdated(payload: { playerId: string; stageNumber: number; scoreAwarded: number }) {
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
    // 1. Auth
    const cookieStore = await cookies();
    const token = cookieStore.get('game_session_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    let player: { id: string; username: string };
    try {
      player = jwt.verify(token, process.env.JWT_SECRET!) as {
        id: string;
        username: string;
      };
    } catch {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

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
    const { data: existing } = await supabase
      .from('stage_completions')
      .select('id, score_awarded')
      .eq('player_id', player.id)
      .eq('stage_number', parsedStageNumber)
      .maybeSingle();

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

    // 5. Derive started_at from MIN(prompt_logs.created_at) for this player+stage.
    //    submitted_at is "now". time_taken_seconds is computed server-side so the
    //    client cannot influence the score via a forged elapsedSeconds.
    const submittedAt = new Date();
    const { data: firstPrompt, error: firstPromptError } = await supabase
      .from('prompt_logs')
      .select('created_at')
      .eq('player_id', player.id)
      .eq('stage_number', parsedStageNumber)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (firstPromptError) throw firstPromptError;

    const startedAt = firstPrompt?.created_at ? new Date(firstPrompt.created_at) : submittedAt;
    const rawTimeTakenSeconds = Math.max(
      0,
      Math.floor((submittedAt.getTime() - startedAt.getTime()) / 1000),
    );

    // Anti-cheat: clamp to a minimum-time floor before storing or scoring.
    // Legitimate solves on any stage take well over MIN_TIME_FLOOR_SECONDS;
    // sub-floor times indicate prompt copying from another account.
    // Clamping (vs. rejecting) is non-disruptive: cheaters still complete the
    // stage but lose the inflated time-bonus and the "ridiculous" leaderboard time.
    const MIN_TIME_FLOOR_SECONDS = 40;
    const timeTakenSeconds = Math.max(rawTimeTakenSeconds, MIN_TIME_FLOOR_SECONDS);
    if (rawTimeTakenSeconds < MIN_TIME_FLOOR_SECONDS) {
      console.warn(
        `[validate-code] sub-floor time clamped: player=${player.id} stage=${parsedStageNumber} raw=${rawTimeTakenSeconds}s -> ${MIN_TIME_FLOOR_SECONDS}s`,
      );
    }

    // 6. Compute score: baseXP + time bonus
    const timeBonus = computeTimeBonus(timeTakenSeconds, stageConfig.baseXP);
    const grossScore = stageConfig.baseXP + timeBonus;
    const scoreAwarded = grossScore;

    // 7. Record completion
    const { error: completionError } = await supabase
      .from('stage_completions')
      .insert({
        player_id: player.id,
        stage_number: parsedStageNumber,
        score_awarded: scoreAwarded,
        time_taken_seconds: timeTakenSeconds,
        started_at: startedAt.toISOString(),
        submitted_at: submittedAt.toISOString(),
      });

    if (completionError) throw completionError;

    // 8. Update total_score on the player row (increment)
    const { error: scoreError } = await supabase.rpc('increment_player_score', {
      p_player_id: player.id,
      p_amount: scoreAwarded,
    });

    if (scoreError) {
      // Fallback: manual update if RPC not available
      const { data: playerRow } = await supabase
        .from('players')
        .select('total_score')
        .eq('id', player.id)
        .single();

      await supabase
        .from('players')
        .update({ total_score: (playerRow?.total_score ?? 0) + scoreAwarded })
        .eq('id', player.id);
    }

    // 9. Mark the most recent prompt log as successful
    supabase
      .from('prompt_logs')
      .update({ is_successful: true })
      .eq('player_id', player.id)
      .eq('stage_number', parsedStageNumber)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ error }) => {
        if (error) console.error('[prompt_logs update]', error);
      });

    // 10. Anti-cheat: Find the user's longest prompt for this stage and embed it.
    // This happens async after we've already responded — no latency hit for the player.
    (async () => {
      try {
        const hasEmbeddingKey = Boolean(process.env.EMBEDDING_API_KEY || process.env.LLM_API_KEY);
        if (!hasEmbeddingKey) {
          console.warn('[validate-code] Embedding key missing; skipping winning embedding save.');
          return;
        }

        // Fetch their prompt logs for this stage to find the longest one
        const { data: prompts } = await supabase
          .from('prompt_logs')
          .select('prompt_text')
          .eq('player_id', player.id)
          .eq('stage_number', parsedStageNumber);

        if (!prompts || prompts.length === 0) return;

        // Get the longest prompt. Minimum 20 chars to avoid generic words like "yes"
        const longestPrompt = prompts
          .map(p => p.prompt_text.trim())
          .filter(text => text.length >= 20)
          .reduce((a, b) => a.length >= b.length ? a : b, '');

        if (!longestPrompt) {
          console.warn('[validate-code] No prompt long enough to save for anti-cheat.');
          return;
        }

        const embedding = await embedText(longestPrompt);
        await saveWinningPrompt(
          supabase,
          player.id,
          parsedStageNumber,
          longestPrompt,
          embedding,
        );
      } catch (err) {
        // Non-fatal — don't let embedding failure block the win
        console.error('[validate-code] Failed to save winning embedding:', err);
      }
    })();

    // 11. Broadcast score_updated event to Supabase Realtime
    // This notifies all leaderboard subscribers to re-fetch — zero polling needed.
    // Fire-and-forget: don't await so it doesn't add latency to the response.
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