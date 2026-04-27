'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface Player {
  id: string;
  username: string;
  email: string | null;
  total_score: number;
  is_banned: boolean;
  banned_reason: string | null;
  is_verified: boolean;
  created_at: string;
  registration_ip: string | null;
}

type Filter = 'all' | 'active' | 'banned';

const PAGE_SIZE = 50;

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
        filter,
      });
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/admin/players?${params}`, { credentials: 'same-origin' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Failed to load');
      setPlayers(json.players);
      setTotal(json.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [offset, filter, search]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Players</h1>
        <span className="text-sm text-slate-400">{total.toLocaleString()} total</span>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
          placeholder="Search username or email…"
          className="w-72 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
        <div className="flex rounded-md border border-slate-700 bg-slate-900 p-0.5 text-sm">
          {(['all', 'active', 'banned'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => {
                setFilter(f);
                setOffset(0);
              }}
              className={`rounded px-3 py-1.5 capitalize ${
                filter === f
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3 text-right">Score</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3">IP</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-950">
            {loading && players.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && players.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No players found.
                </td>
              </tr>
            )}
            {players.map((p) => (
              <tr key={p.id} className="hover:bg-slate-900/40">
                <td className="px-4 py-3 font-medium text-slate-100">{p.username}</td>
                <td className="px-4 py-3 text-slate-300">{p.email ?? '—'}</td>
                <td className="px-4 py-3 text-right font-mono">{p.total_score}</td>
                <td className="px-4 py-3">
                  {p.is_banned ? (
                    <span className="rounded bg-red-950/60 px-2 py-0.5 text-xs text-red-300">
                      Banned
                    </span>
                  ) : (
                    <span className="rounded bg-emerald-950/60 px-2 py-0.5 text-xs text-emerald-300">
                      Active
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-400">
                  {new Date(p.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-400">
                  {p.registration_ip ?? '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/players/${p.id}`}
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

      <Pagination
        offset={offset}
        pageSize={PAGE_SIZE}
        total={total}
        onChange={setOffset}
      />
    </div>
  );
}

function Pagination({
  offset,
  pageSize,
  total,
  onChange,
}: {
  offset: number;
  pageSize: number;
  total: number;
  onChange: (n: number) => void;
}) {
  const page = Math.floor(offset / pageSize) + 1;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between text-sm text-slate-400">
      <span>
        Page {page} of {pages}
      </span>
      <div className="flex gap-2">
        <button
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - pageSize))}
          className="rounded-md border border-slate-700 px-3 py-1 disabled:opacity-40"
        >
          Previous
        </button>
        <button
          disabled={offset + pageSize >= total}
          onClick={() => onChange(offset + pageSize)}
          className="rounded-md border border-slate-700 px-3 py-1 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
