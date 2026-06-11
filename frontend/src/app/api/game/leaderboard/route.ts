// frontend/src/app/api/game/leaderboard/route.ts
// GET /api/game/leaderboard
// Returns top 10 leaderboard entries + total player count.
// Only active (session_active = true), non-banned players are included.

import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(' : ');
}

export async function GET() {
  try {
    const playersRes = await pool.query(
      `SELECT id, username, total_score
       FROM players
       WHERE session_active = true AND is_banned = false
       ORDER BY total_score DESC`,
    );

    const players = playersRes.rows;

    if (!players || players.length === 0) {
      return NextResponse.json({ leaderboard: [], totalPlayers: 0 });
    }

    const playerIds = players.map((p) => p.id);

    const completionsRes = await pool.query(
      `SELECT player_id, time_taken_seconds
       FROM stage_completions
       WHERE player_id = ANY($1)`,
      [playerIds],
    );

    const completionMap = new Map<
      string,
      { stagesPassed: number; totalSeconds: number }
    >();
    for (const c of completionsRes.rows) {
      const existing = completionMap.get(c.player_id) ?? {
        stagesPassed: 0,
        totalSeconds: 0,
      };
      completionMap.set(c.player_id, {
        stagesPassed: existing.stagesPassed + 1,
        totalSeconds: existing.totalSeconds + Number(c.time_taken_seconds),
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
          totalScore: Number(p.total_score),
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
      leaderboard: ranked.slice(0, 10),
      totalPlayers: ranked.length,
      allPlayers: ranked, // included so the caller can find the current player's rank
    });
  } catch (error: unknown) {
    console.error('[/api/game/leaderboard]', error);
    return NextResponse.json({ error: 'Failed to load leaderboard' }, { status: 500 });
  }
}
