'use client';

import { useEffect, useState, useCallback } from 'react';

interface AuditEntry {
  id: string;
  admin_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  admin_users: { email: string; name: string | null } | null;
}

const PAGE_SIZE = 25;

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (actionFilter.trim()) params.set('action', actionFilter.trim());
      const res = await fetch(`/api/admin/audit?${params}`, { credentials: 'same-origin' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Failed');
      setEntries(json.entries);
      setTotal(json.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [offset, actionFilter]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold sm:text-2xl">Audit Log</h1>
        <span className="text-sm text-slate-400">{total.toLocaleString()} entries</span>
      </div>

      <input
        value={actionFilter}
        onChange={(e) => {
          setActionFilter(e.target.value);
          setOffset(0);
        }}
        placeholder="Filter by action (e.g. ban_player, update_stage)…"
        className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm sm:w-96"
      />

      {error && (
        <div className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="max-h-[calc(100vh-16rem)] overflow-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="sticky top-0 z-10 bg-slate-900/95 text-left text-xs uppercase tracking-wide text-slate-400 backdrop-blur">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Admin</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Details</th>
              <th className="px-4 py-3">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-950">
            {loading && entries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No entries.
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.id} className="align-top hover:bg-slate-900/40">
                <td className="px-4 py-3 text-slate-400">
                  {new Date(e.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  {e.admin_users?.email ?? <span className="text-slate-500">—</span>}
                </td>
                <td className="px-4 py-3">
                  <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs">
                    {e.action}
                  </code>
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">
                  {e.target_type ?? '—'}
                  {e.target_id && (
                    <>
                      <br />
                      <span className="font-mono">{e.target_id.slice(0, 16)}</span>
                    </>
                  )}
                </td>
                <td className="px-4 py-3">
                  {e.details ? (
                    <pre className="max-w-md overflow-x-auto whitespace-pre-wrap break-words text-xs text-slate-400">
                      {JSON.stringify(e.details, null, 0)}
                    </pre>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-400">
                  {e.ip_address ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
        <span>
          Showing {entries.length === 0 ? 0 : offset + 1}–{offset + entries.length} of{' '}
          {total}
        </span>
        <div className="flex gap-2">
          <button
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            className="rounded-md border border-slate-700 px-3 py-1 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            className="rounded-md border border-slate-700 px-3 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
