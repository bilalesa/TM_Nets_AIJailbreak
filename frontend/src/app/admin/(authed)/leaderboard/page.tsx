'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabaseClient';

interface Entry {
  id: string;
  username: string;
  email: string | null;
  totalScore: number;
  stagesPassed: number;
  totalSeconds: number;
  totalTimeFormatted: string;
  isBanned: boolean;
  createdAt: string;
  rank: number;
}

export default function AdminLeaderboardPage() {
  const [rows, setRows] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/admin/leaderboard', {
        credentials: 'same-origin',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Failed');
      setRows(json.leaderboard);
      setTotal(json.totalPlayers);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  // Live updates via Supabase Realtime — same channel game leaderboard uses.
  useEffect(() => {
    let client;
    try {
      client = getSupabaseBrowserClient();
    } catch (e) {
      console.error('[admin leaderboard] supabase init', e);
      return;
    }

    const channel = client
      .channel('leaderboard-updates')
      .on('broadcast', { event: 'score_updated' }, () => load(true))
      .on('broadcast', { event: 'player_joined' }, () => load(true))
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold sm:text-2xl">Leaderboard</h1>
        <div className="flex items-center gap-4 text-sm text-slate-400">
          <span>{total.toLocaleString()} players</span>
          <button
            onClick={() => load(false)}
            className="rounded-md border border-slate-700 px-3 py-1.5 hover:bg-slate-800"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[880px] text-sm">
          <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3 w-16">Rank</th>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3 text-right">Score</th>
              <th className="px-4 py-3 text-right">Stages</th>
              <th className="px-4 py-3 text-right">Total Time</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-950">
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  No players yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-900/40">
                <td className="px-4 py-3 font-mono text-slate-300">
                  #{String(r.rank).padStart(2, '0')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-100">{r.username}</span>
                    {r.isBanned && (
                      <span className="rounded bg-red-950/60 px-2 py-0.5 text-xs text-red-300">
                        Banned
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-300">{r.email ?? '—'}</td>
                <td className="px-4 py-3 text-right font-mono">
                  {r.totalScore.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-300">
                  {r.stagesPassed}/5
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-300">
                  {r.stagesPassed > 0 ? r.totalTimeFormatted : '—'}
                </td>
                <td className="px-4 py-3 text-slate-400">
                  {new Date(r.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/players/${r.id}`}
                    className="rounded-md border border-slate-700 px-2.5 py-1 text-xs hover:bg-slate-800"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
