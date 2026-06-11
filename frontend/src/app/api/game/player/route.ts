// frontend/src/app/api/game/player/route.ts
// Returns the current player's profile + which stages they've completed.

import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getPlayerFromCookie } from '@/lib/playerSession';

export async function GET() {
  try {
    const session = await getPlayerFromCookie();
    if (!session.ok) return session.response;
    const { player } = session;

    const [playerRes, completionsRes] = await Promise.all([
      pool.query(
        'SELECT id, username, total_score, created_at FROM players WHERE id = $1 LIMIT 1',
        [player.id],
      ),
      pool.query(
        `SELECT stage_number, score_awarded, time_taken_seconds, completed_at
         FROM stage_completions
         WHERE player_id = $1
         ORDER BY stage_number ASC`,
        [player.id],
      ),
    ]);

    const playerRow = playerRes.rows[0] ?? null;
    if (!playerRow) {
      return NextResponse.json(
        { error: 'Session expired', code: 'PLAYER_GONE' },
        { status: 401 },
      );
    }

    const completions = completionsRes.rows;

    return NextResponse.json({
      player: playerRow,
      completedStages: completions.map((c: { stage_number: number }) => c.stage_number),
      completions,
    });
  } catch (error: unknown) {
    console.error('[/api/game/player]', error);
    return NextResponse.json({ error: 'Failed to load player profile' }, { status: 500 });
  }
}
