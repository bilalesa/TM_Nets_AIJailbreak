'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Stage {
  id: string;
  stage_number: number;
  name: string;
  subtitle: string | null;
  base_xp: number;
  is_active: boolean;
  updated_at: string | null;
}

export default function StagesPage() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/stages', { credentials: 'same-origin' });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? 'Failed');
        setStages(json.stages);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Stages</h1>

      {error && (
        <div className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-slate-400">Loading…</div>
      ) : stages.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-400">
          No stages found. Run{' '}
          <code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-200">
            db/migrations/20260428_seed_stage_configs.sql
          </code>{' '}
          against your Supabase instance to populate the <code>stage_configs</code> table.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {stages.map((s) => (
            <Link
              key={s.id}
              href={`/admin/stages/${s.stage_number}`}
              className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 transition hover:border-slate-600"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    Stage {s.stage_number}
                  </div>
                  <div className="mt-1 text-lg font-semibold">{s.name}</div>
                  {s.subtitle && (
                    <div className="text-sm text-slate-400">{s.subtitle}</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm">{s.base_xp} XP</div>
                  {s.is_active ? (
                    <span className="rounded bg-emerald-950/60 px-2 py-0.5 text-xs text-emerald-300">
                      Active
                    </span>
                  ) : (
                    <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                      Inactive
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
