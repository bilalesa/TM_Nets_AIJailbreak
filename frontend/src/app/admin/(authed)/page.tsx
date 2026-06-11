// Admin dashboard. Server component — fetches stats directly from the DB
// rather than re-routing through the API for the same auth check.

import { requireAdmin } from '@/lib/adminAuth';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Stats {
  players: { total: number; banned: number; joinedLast24h: number };
  completions: { total: number; byStage: Record<number, number> };
  activity: { promptsLast24h: number };
}

async function loadStats(): Promise<Stats> {
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

  return {
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
  };
}

export default async function AdminDashboardPage() {
  await requireAdmin();
  const stats = await loadStats();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold sm:text-2xl">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total players" value={stats.players.total} />
        <StatCard label="Joined (24h)" value={stats.players.joinedLast24h} />
        <StatCard label="Banned" value={stats.players.banned} accent="red" />
        <StatCard label="Prompts (24h)" value={stats.activity.promptsLast24h} />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-slate-400">
          Stage completions
        </h2>
        <div className="mb-4 text-3xl font-semibold">{stats.completions.total}</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[1, 2, 3, 4, 5].map((n) => (
            <div
              key={n}
              className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-sm"
            >
              <div className="text-xs uppercase tracking-wide text-slate-500">Stage {n}</div>
              <div className="mt-1 text-xl font-semibold text-slate-100">
                {stats.completions.byStage[n] ?? 0}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: 'red';
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div
        className={`mt-2 text-3xl font-semibold ${
          accent === 'red' ? 'text-red-400' : 'text-slate-100'
        }`}
      >
        {value.toLocaleString()}
      </div>
    </div>
  );
}
