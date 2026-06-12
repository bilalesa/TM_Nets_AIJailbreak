import { requireAdmin } from '@/lib/adminAuth';
import { cookies } from 'next/headers';
import { getBackendBaseUrl } from '@/lib/backendUrl';

export const dynamic = 'force-dynamic';

interface Stats {
  players: { total: number; banned: number; joinedLast24h: number };
  completions: { total: number; byStage: Record<number, number> };
  activity: { promptsLast24h: number };
}

async function loadStats(adminToken: string | undefined): Promise<Stats> {
  const res = await fetch(`${getBackendBaseUrl()}/api/admin/stats`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to load stats');
  return res.json();
}

export default async function AdminDashboardPage() {
  await requireAdmin();
  const cookieStore = await cookies();
  const adminToken = cookieStore.get('admin_session_token')?.value;
  const stats = await loadStats(adminToken);

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
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-slate-400">Stage completions</h2>
        <div className="mb-4 text-3xl font-semibold">{stats.completions.total}</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-slate-500">Stage {n}</div>
              <div className="mt-1 text-xl font-semibold text-slate-100">{stats.completions.byStage[n] ?? 0}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: 'red' }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${accent === 'red' ? 'text-red-400' : 'text-slate-100'}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}
