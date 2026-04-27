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
    // winningPrompt: the last message the user sent before submitting the code.
    // We use it to embed and store in cracked_prompts for the anti-cheat system.
    const { stageNumber, code, elapsedSeconds, winningPrompt } = await request.json() as {
      stageNumber: number;
      code: string;
      elapsedSeconds: number;
      winningPrompt?: string; // optional — gracefully skipped if not provided
    };

    if (!stageNumber || stageNumber < 1 || stageNumber > 5) {
      return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });
    }

    // 3. Prevent double-submission
    const { data: existing } = await supabase
      .from('stage_completions')
      .select('id, score_awarded')
      .eq('player_id', player.id)
      .eq('stage_number', stageNumber)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        correct: true,
        alreadyCompleted: true,
        scoreAwarded: existing.score_awarded,
      });
    }

    // 4. Validate code (case-insensitive, trimmed)
    const stageConfig = SERVER_STAGE_CONFIGS[stageNumber - 1];
    const expectedCode = deriveUserStageCode(player.id, stageNumber, stageConfig.secretCode);
    const isCorrect =
      code.trim().toUpperCase() === expectedCode.toUpperCase();

    if (!isCorrect) {
      return NextResponse.json({ correct: false });
    }

    // 5. Compute score: baseXP + time bonus
    const timeBonus = computeTimeBonus(elapsedSeconds, stageConfig.baseXP);
    const grossScore = stageConfig.baseXP + timeBonus;
    const scoreAwarded = grossScore;

    // 6. Record completion
    const { error: completionError } = await supabase
      .from('stage_completions')
      .insert({
        player_id: player.id,
        stage_number: stageNumber,
        score_awarded: scoreAwarded,
        time_taken_seconds: elapsedSeconds,
      });

    if (completionError) throw completionError;

    // 7. Update total_score on the player row (increment)
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

    // 8. Mark the most recent prompt log as successful
    supabase
      .from('prompt_logs')
      .update({ is_successful: true })
      .eq('player_id', player.id)
      .eq('stage_number', stageNumber)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ error }) => {
        if (error) console.error('[prompt_logs update]', error);
      });

    // 9. Anti-cheat: embed the winning prompt and store it in cracked_prompts
    // This happens async after we've already responded — no latency hit for the player.
    if (winningPrompt?.trim()) {
      (async () => {
        try {
          const embedding = await embedText(winningPrompt.trim());
          await saveWinningPrompt(
            supabase,
            player.id,
            stageNumber,
            winningPrompt.trim(),
            embedding,
          );
        } catch (err) {
          // Non-fatal — don't let embedding failure block the win
          console.error('[validate-code] Failed to save winning embedding:', err);
        }
      })();
    }

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