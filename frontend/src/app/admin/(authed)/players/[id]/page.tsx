'use client';

import { useEffect, useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
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
  client_fingerprint: string | null;
  session_active: boolean;
}

interface Completion {
  stage_number: number;
  score_awarded: number;
  time_taken_seconds: number;
  started_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
}

interface PromptLog {
  id: string;
  stage_number: number;
  prompt_text: string;
  ai_response: string | null;
  is_successful: boolean | null;
  is_blocked_by_anticheat: boolean | null;
  created_at: string;
}

export default function PlayerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [player, setPlayer] = useState<Player | null>(null);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [prompts, setPrompts] = useState<PromptLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [banReason, setBanReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/players/${id}`, { credentials: 'same-origin' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Failed');
      setPlayer(json.player);
      setCompletions(json.completions);
      setPrompts(json.promptLogs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function ban() {
    if (!banReason.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/players/${id}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: banReason }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error ?? 'Failed to ban');
        return;
      }
      setBanReason('');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function unban() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/players/${id}/unban`, { method: 'POST' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error ?? 'Failed to unban');
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function deletePlayer() {
    if (!confirm(`Delete ${player?.username}? This is permanent.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/players/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error ?? 'Failed to delete');
        return;
      }
      router.replace('/admin/players');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="text-slate-400">Loading…</div>;
  if (error || !player)
    return (
      <div className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
        {error ?? 'Player not found'}
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/players"
          className="text-sm text-slate-400 hover:text-slate-200"
        >
          ← Back
        </Link>
        <h1 className="break-all text-xl font-semibold sm:text-2xl">{player.username}</h1>
        {player.is_banned ? (
          <span className="rounded bg-red-950/60 px-2 py-0.5 text-xs text-red-300">
            Banned
          </span>
        ) : (
          <span className="rounded bg-emerald-950/60 px-2 py-0.5 text-xs text-emerald-300">
            Active
          </span>
        )}
        {player.is_verified ? (
          <span className="rounded bg-sky-950/60 px-2 py-0.5 text-xs text-sky-300">
            Email verified
          </span>
        ) : (
          <span className="rounded bg-amber-950/60 px-2 py-0.5 text-xs text-amber-300">
            Email unverified
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Detail label="ID" value={<code className="text-xs">{player.id}</code>} />
        <Detail label="Email" value={player.email ?? '—'} />
        <Detail label="Score" value={player.total_score.toString()} />
        <Detail label="Joined" value={new Date(player.created_at).toLocaleString()} />
        <Detail label="Registration IP" value={player.registration_ip ?? '—'} />
        <Detail
          label="Fingerprint"
          value={
            player.client_fingerprint ? (
              <code className="text-xs">{player.client_fingerprint.slice(0, 24)}…</code>
            ) : (
              '—'
            )
          }
        />
        <Detail label="Session active" value={player.session_active ? 'Yes' : 'No'} />
        <Detail label="Verified" value={player.is_verified ? 'Yes' : 'No'} />
        {player.is_banned && (
          <Detail label="Ban reason" value={player.banned_reason ?? '—'} />
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 sm:p-6">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-slate-400">
          Moderation
        </h2>
        {player.is_banned ? (
          <button
            onClick={unban}
            disabled={busy}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            Unban player
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="Reason (required)"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm sm:w-72"
            />
            <button
              onClick={ban}
              disabled={busy || !banReason.trim()}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              Ban player
            </button>
          </div>
        )}
        <button
          onClick={deletePlayer}
          disabled={busy}
          className="mt-4 block rounded-md border border-red-900/60 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/40 disabled:opacity-50"
        >
          Delete (super_admin only)
        </button>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 sm:p-6">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-slate-400">
          Stage completions ({completions.length})
        </h2>
        {completions.length === 0 ? (
          <div className="text-sm text-slate-500">No completions yet.</div>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2">Stage</th>
                  <th className="py-2 text-right">Score</th>
                  <th className="py-2 text-right">Time (s)</th>
                  <th className="py-2">Started</th>
                  <th className="py-2">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {completions.map((c) => (
                  <tr key={c.stage_number}>
                    <td className="py-2 font-mono">#{c.stage_number}</td>
                    <td className="py-2 text-right font-mono">{c.score_awarded}</td>
                    <td className="py-2 text-right font-mono">{c.time_taken_seconds}</td>
                    <td className="py-2 text-slate-400">
                      {c.started_at ? new Date(c.started_at).toLocaleString() : '—'}
                    </td>
                    <td className="py-2 text-slate-400">
                      {c.submitted_at
                        ? new Date(c.submitted_at).toLocaleString()
                        : c.completed_at
                        ? new Date(c.completed_at).toLocaleString()
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 sm:p-6">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-slate-400">
          Recent prompts ({prompts.length})
        </h2>
        {prompts.length === 0 ? (
          <div className="text-sm text-slate-500">No prompts.</div>
        ) : (
          <ul className="space-y-3">
            {prompts.map((p) => (
              <li
                key={p.id}
                className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm"
              >
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">
                    Stage {p.stage_number}
                  </span>
                  <span>{new Date(p.created_at).toLocaleString()}</span>
                  {p.is_successful && (
                    <span className="rounded bg-emerald-950/60 px-1.5 py-0.5 text-emerald-300">
                      success
                    </span>
                  )}
                  {p.is_blocked_by_anticheat && (
                    <span className="rounded bg-amber-950/60 px-1.5 py-0.5 text-amber-300">
                      blocked
                    </span>
                  )}
                </div>
                <div className="whitespace-pre-wrap break-words text-slate-200">
                  {p.prompt_text}
                </div>
                {p.ai_response && (
                  <div className="mt-2 whitespace-pre-wrap break-words border-t border-slate-800 pt-2 text-slate-400">
                    {p.ai_response}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm text-slate-100">{value}</div>
    </div>
  );
}
