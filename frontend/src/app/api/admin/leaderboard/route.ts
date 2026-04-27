// Admin leaderboard: full ranking with email + signup metadata.
// Includes banned players (so admins can audit) and ties broken by total time.

import { NextResponse } from 'next/server';
import { AdminAuthError, requireAdmin } from '@/lib/adminAuth';
import { getSupabaseServerClient } from '@/lib/supabaseClient';

const supabase = getSupabaseServerClient();

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

export async function GET() {
  try {
    await requireAdmin();

    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('id, username, email, total_score, is_banned, created_at')
      .order('total_score', { ascending: false });

    if (playersError) throw playersError;

    if (!players || players.length === 0) {
      return NextResponse.json({ leaderboard: [], totalPlayers: 0 });
    }

    const playerIds = players.map((p) => p.id);
    const { data: completions, error: completionsError } = await supabase
      .from('stage_completions')
      .select('player_id, stage_number, time_taken_seconds')
      .in('player_id', playerIds);

    if (completionsError) throw completionsError;

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

    const ranked = players
      .map((p) => {
        const agg = completionMap.get(p.id) ?? {
          stagesPassed: 0,
          totalSeconds: 0,
        };
        return {
          id: p.id,
          username: p.username,
          email: p.email,
          totalScore: p.total_score,
          isBanned: p.is_banned,
          createdAt: p.created_at,
          stagesPassed: agg.stagesPassed,
          totalSeconds: agg.totalSeconds,
          totalTimeFormatted: formatTime(agg.totalSeconds),
        };
      })
      .sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        return a.totalSeconds - b.totalSeconds;
      })
      .map((p, i) => ({ ...p, rank: i + 1 }));

    return NextResponse.json({
      leaderboard: ranked,
      totalPlayers: ranked.length,
    });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[admin/leaderboard GET]', err);
    return NextResponse.json({ error: 'Failed to load leaderboard' }, { status: 500 });
  }
}
