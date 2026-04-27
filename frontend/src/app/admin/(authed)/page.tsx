// Admin dashboard. Server component — fetches stats directly from Supabase
// rather than re-routing through the API for the same auth check.

import { requireAdmin } from '@/lib/adminAuth';
import { getSupabaseServerClient } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

interface Stats {
  players: { total: number; banned: number; joinedLast24h: number };
  completions: { total: number; byStage: Record<number, number> };
  activity: { promptsLast24h: number };
}

async function loadStats(): Promise<Stats> {
  const supabase = getSupabaseServerClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    playersTotal,
    playersBanned,
    playersRecent,
    completionsTotal,
    promptsTotal,
    stageBreakdown,
  ] = await Promise.all([
    supabase.from('players').select('*', { count: 'exact', head: true }),
    supabase.from('players').select('*', { count: 'exact', head: true }).eq('is_banned', true),
    supabase
      .from('players')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', since24h),
    supabase.from('stage_completions').select('*', { count: 'exact', head: true }),
    supabase
      .from('prompt_logs')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', since24h),
    supabase.from('stage_completions').select('stage_number'),
  ]);

  const counts: Record<number, number> = {};
  for (const row of stageBreakdown.data ?? []) {
    const n = (row as { stage_number: number }).stage_number;
    counts[n] = (counts[n] ?? 0) + 1;
  }

  return {
    players: {
      total: playersTotal.count ?? 0,
      banned: playersBanned.count ?? 0,
      joinedLast24h: playersRecent.count ?? 0,
    },
    completions: {
      total: completionsTotal.count ?? 0,
      byStage: counts,
    },
    activity: { promptsLast24h: promptsTotal.count ?? 0 },
  };
}

export default async function AdminDashboardPage() {
  await requireAdmin();
  const stats = await loadStats();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

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
