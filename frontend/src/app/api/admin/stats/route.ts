import { NextResponse } from 'next/server';
import { AdminAuthError, requireAdmin } from '@/lib/adminAuth';
import { pool } from '@/lib/db';

export async function GET() {
  try {
    await requireAdmin();

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [
      playersTotalRes,
      playersBannedRes,
      playersRecentRes,
      completionsTotalRes,
      promptsTotalRes,
      stageBreakdownRes,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) AS count FROM players'),
      pool.query('SELECT COUNT(*) AS count FROM players WHERE is_banned = true'),
      pool.query('SELECT COUNT(*) AS count FROM players WHERE created_at >= $1', [since24h]),
      pool.query('SELECT COUNT(*) AS count FROM stage_completions'),
      pool.query('SELECT COUNT(*) AS count FROM prompt_logs WHERE created_at >= $1', [since24h]),
      pool.query('SELECT stage_number FROM stage_completions'),
    ]);

    const counts: Record<number, number> = {};
    for (const row of stageBreakdownRes.rows) {
      const n = Number(row.stage_number);
      counts[n] = (counts[n] ?? 0) + 1;
    }

    return NextResponse.json({
      players: {
        total: parseInt(playersTotalRes.rows[0]?.count ?? '0', 10),
        banned: parseInt(playersBannedRes.rows[0]?.count ?? '0', 10),
        joinedLast24h: parseInt(playersRecentRes.rows[0]?.count ?? '0', 10),
      },
      completions: {
        total: parseInt(completionsTotalRes.rows[0]?.count ?? '0', 10),
        byStage: counts,
      },
      activity: {
        promptsLast24h: parseInt(promptsTotalRes.rows[0]?.count ?? '0', 10),
      },
    });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[admin/stats]', err);
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 });
  }
}
