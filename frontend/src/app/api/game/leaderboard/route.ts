// frontend/src/app/api/game/leaderboard/route.ts
// Returns the full leaderboard ranked by total_score DESC, then by total time ASC.
// Also returns the current player's own stats for the hero card at the top.
// Polled every 10s from the client for live updates — no WebSocket needed.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { getSupabaseServerClient } from '@/lib/supabaseClient';

const supabase = getSupabaseServerClient();

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(' : ');
}

export async function GET() {
  try {
    // 1. Identify current player from cookie (optional — leaderboard is readable even
    //    if the JWT is missing, but we need it to highlight the current user)
    const cookieStore = await cookies();
    const token = cookieStore.get('game_session_token')?.value;
    let currentPlayerId: string | null = null;

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
          id: string;
          username: string;
        };
        currentPlayerId = decoded.id;
      } catch {
        // Token invalid — still show leaderboard, just no highlighting
      }
    }

    // 2. Fetch all active players with their scores (excluding banned)
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('id, username, total_score')
      .eq('session_active', true)
      .eq('is_banned', false)
      .order('total_score', { ascending: false });

    if (playersError) throw playersError;

    if (!players || players.length === 0) {
      return NextResponse.json({
        leaderboard: [],
        currentPlayer: null,
        totalPlayers: 0,
      });
    }

    // 3. Fetch stage_completions for all these players in one query
    const playerIds = players.map((p) => p.id);

    const { data: completions, error: completionsError } = await supabase
      .from('stage_completions')
      .select('player_id, stage_number, time_taken_seconds')
      .in('player_id', playerIds);

    if (completionsError) throw completionsError;

    // 4. Aggregate completions per player
    const completionMap = new Map<
      string,
      { stagesPassed: number; totalSeconds: number }
    >();

    for (const c of completions ?? []) {
      const existing = completionMap.get(c.player_id) ?? {
        stagesPassed: 0,
        totalSeconds: 0,
      };
      completionMap.set(c.player_id, {
        stagesPassed: existing.stagesPassed + 1,
        totalSeconds: existing.totalSeconds + c.time_taken_seconds,
      });
    }

    // 5. Build ranked list
    // Primary sort: total_score DESC (already from DB)
    // Secondary sort: totalSeconds ASC (faster = better rank on ties)
    const ranked = players
      .map((p) => {
        const agg = completionMap.get(p.id) ?? {
          stagesPassed: 0,
          totalSeconds: 0,
        };
        return {
          id: p.id,
          username: p.username,
          totalScore: p.total_score,
          stagesPassed: agg.stagesPassed,
          totalSeconds: agg.totalSeconds,
          totalTimeFormatted: formatTime(agg.totalSeconds),
          isCurrentPlayer: p.id === currentPlayerId,
        };
      })
      .sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        return a.totalSeconds - b.totalSeconds; // faster wins on tie
      })
      .map((p, i) => ({ ...p, rank: i + 1 }));

    // 6. Find current player's entry
    const currentPlayer = ranked.find((p) => p.isCurrentPlayer) ?? null;

    return NextResponse.json({
      leaderboard: ranked,
      currentPlayer,
      totalPlayers: ranked.length,
    });
  } catch (error: unknown) {
    console.error('[/api/game/leaderboard]', error);
    return NextResponse.json({ error: 'Failed to load leaderboard' }, { status: 500 });
  }
}