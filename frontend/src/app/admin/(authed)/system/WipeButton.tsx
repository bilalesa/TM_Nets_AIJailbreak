'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface WipeResult {
  players_deleted?: number;
  stage_completions_deleted?: number;
  prompt_logs_deleted?: number;
  cracked_prompts_deleted?: number;
  duration_ms?: number;
  wiped_at?: string;
}

export default function WipeButton() {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WipeResult | null>(null);

  // Auto-disarm after 6s so a stray click can't fire a wipe minutes later.
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 6000);
    return () => clearTimeout(t);
  }, [armed]);

  async function fire() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/system/wipe', {
        method: 'POST',
        credentials: 'same-origin',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? `Wipe failed (${res.status})`);
        return;
      }
      setResult((json?.result ?? null) as WipeResult | null);
      setArmed(false);
      // Refresh the server component so "Last wipe" updates from audit log.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Wipe failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {!armed ? (
          <button
            onClick={() => setArmed(true)}
            disabled={busy}
            className="rounded-md bg-gradient-to-r from-red-600 to-red-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:from-red-500 hover:to-red-600 disabled:opacity-50"
          >
            Wipe all gameplay data
          </button>
        ) : (
          <>
            <button
              onClick={fire}
              disabled={busy}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white ring-2 ring-red-400 ring-offset-2 ring-offset-slate-950 hover:bg-red-500 disabled:opacity-50"
            >
              {busy ? 'Wiping…' : 'Confirm — really wipe everything'}
            </button>
            <button
              onClick={() => setArmed(false)}
              disabled={busy}
              className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <span className="text-xs text-slate-400">Confirms within 6s, then re-arms.</span>
          </>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-md border border-emerald-900/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100">
          <div className="mb-1 font-medium">Wipe complete</div>
          <ul className="ml-5 list-disc text-emerald-200/90">
            <li>{result.players_deleted ?? 0} players deleted</li>
            <li>{result.stage_completions_deleted ?? 0} stage completions deleted</li>
            <li>{result.prompt_logs_deleted ?? 0} prompt logs deleted</li>
            <li>{result.cracked_prompts_deleted ?? 0} cracked prompts deleted</li>
            {typeof result.duration_ms === 'number' && (
              <li>{result.duration_ms} ms</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
