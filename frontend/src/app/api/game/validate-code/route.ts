// frontend/src/app/api/game/validate-code/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Validates the secret code a player submits for a stage.
// - Checks the code server-side (never exposed to client)
// - If correct, records the stage completion + awards XP
// - Updates the player's total_score
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { SERVER_STAGE_CONFIGS } from '@/lib/stageConfig';
import { deriveUserStageCode } from '@/lib/stageCode';
import { computeTimeBonus } from '@/lib/avatar';
import { hashPrompt } from '@/lib/promptHash';
import { getSupabaseServerClient } from '@/lib/supabaseClient';
import { getPlayerFromCookie } from '@/lib/playerSession';

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
    // 1. Auth — validates JWT AND confirms player still exists. After a
    // daily wipe (Phase 3a) JWTs survive but rows don't; the helper returns
    // 401 PLAYER_GONE so the client clears its cookie and re-signs up.
    const session = await getPlayerFromCookie(supabase);
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

    // 4b. Audit signal: snapshot the player's current fingerprint so we can
    // freeze it onto the completion row at insert time (step 7). We do NOT
    // block on cross-account fingerprint matches — iOS Safari normalizes
    // fingerprints heavily across identical device models, so a runtime
    // block would generate too many false positives at booth events. The
    // snapshot is purely for admin visibility / forensic review.
    const { data: requestingPlayer, error: requestingPlayerError } = await supabase
      .from('players')
      .select('client_fingerprint')
      .eq('id', player.id)
      .maybeSingle();
    if (requestingPlayerError) throw requestingPlayerError;

    const requestingFingerprint = requestingPlayer?.client_fingerprint ?? null;

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

    // 7. Record completion. client_fingerprint is snapshotted at win time so
    // admins can spot multi-account abuse during forensic review (e.g. five
    // wins on five accounts all sharing one fingerprint within minutes).
    const { error: completionError } = await supabase
      .from('stage_completions')
      .insert({
        player_id: player.id,
        stage_number: parsedStageNumber,
        score_awarded: scoreAwarded,
        time_taken_seconds: timeTakenSeconds,
        started_at: startedAt.toISOString(),
        submitted_at: submittedAt.toISOString(),
        client_fingerprint: requestingFingerprint,
      });

    if (completionError) throw completionError;

    // 8. Update total_score on the player row (increment)
    const { error: scoreError } = await supabase.rpc('increment_player_score', {
      p_player_id: player.id,
      p_amount: scoreAwarded,
    });

    if (scoreError) {
      // Fallback: manual update if RPC not available. maybeSingle() so a
      // mid-request wipe doesn't 500 here (the update would simply no-op
      // against a missing row, which is the right behaviour).
      const { data: playerRow } = await supabase
        .from('players')
        .select('total_score')
        .eq('id', player.id)
        .maybeSingle();

      await supabase
        .from('players')
        .update({ total_score: (playerRow?.total_score ?? 0) + scoreAwarded })
        .eq('id', player.id);
    }

    // 9. (Removed) Marking the most-recent prompt log as successful is now
    // done inline by the LLM worker at insert time (see llmWorker.ts) — the
    // worker has the authoritative isSuccessful signal. The previous UPDATE
    // here was both redundant and slightly buggy: it picked the most recent
    // prompt log, which isn't necessarily the winning prompt if the player
    // kept chatting after seeing the secret in an earlier response.

    // 10. Anti-cheat: save the actual cracking prompt for copy-paste detection.
    // We pull the row that the LLM worker flagged as is_successful (the prompt
    // that elicited the secret), normalize + hash it, and store the hash on
    // cracked_prompts. The chat path then does an indexed equality lookup
    // against this hash. Fire-and-forget: doesn't block the response.
    (async () => {
      try {
        const { data: winningPromptRow } = await supabase
          .from('prompt_logs')
          .select('prompt_text')
          .eq('player_id', player.id)
          .eq('stage_number', parsedStageNumber)
          .eq('is_successful', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

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

        const { error: insertError } = await supabase
          .from('cracked_prompts')
          .insert({
            player_id: player.id,
            stage_number: parsedStageNumber,
            prompt_text: winningPrompt,
            text_hash: textHash,
          });

        if (insertError) {
          console.error('[validate-code] Failed to save cracked prompt:', insertError.message);
        }
      } catch (err) {
        // Non-fatal — don't let the anti-cheat save block the win.
        console.error('[validate-code] Failed to save winning prompt hash:', err);
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