'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';

interface Stage {
  id: string;
  stage_number: number;
  name: string;
  subtitle: string | null;
  base_xp: number;
  secret_code: string;
  system_prompt: string;
  opening_message: string | null;
  is_active: boolean;
  updated_at: string | null;
}

export default function StageEditPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = use(params);
  const [stage, setStage] = useState<Stage | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/admin/stages/${number}`, {
          credentials: 'same-origin',
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? 'Failed');
        setStage(json.stage);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed');
      } finally {
        setLoading(false);
      }
    })();
  }, [number]);

  async function save() {
    if (!stage) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/stages/${number}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: stage.name,
          subtitle: stage.subtitle,
          base_xp: Number(stage.base_xp),
          secret_code: stage.secret_code,
          system_prompt: stage.system_prompt,
          opening_message: stage.opening_message,
          is_active: stage.is_active,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Save failed');
      setStage(json.stage);
      setSavedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-slate-400">Loading…</div>;
  if (error && !stage)
    return (
      <div className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
        {error}
      </div>
    );
  if (!stage) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/stages" className="text-sm text-slate-400 hover:text-slate-200">
          ← Back
        </Link>
        <h1 className="text-2xl font-semibold">Stage {stage.stage_number}</h1>
      </div>

      {error && (
        <div className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field
          label="Name"
          value={stage.name}
          onChange={(v) => setStage({ ...stage, name: v })}
        />
        <Field
          label="Subtitle"
          value={stage.subtitle ?? ''}
          onChange={(v) => setStage({ ...stage, subtitle: v })}
        />
        <Field
          label="Base XP"
          type="number"
          value={String(stage.base_xp)}
          onChange={(v) => setStage({ ...stage, base_xp: Number(v) })}
        />
        <Field
          label="Secret code"
          value={stage.secret_code}
          onChange={(v) => setStage({ ...stage, secret_code: v })}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
          System prompt
        </label>
        <textarea
          value={stage.system_prompt}
          onChange={(e) => setStage({ ...stage, system_prompt: e.target.value })}
          rows={14}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
          Opening message
        </label>
        <textarea
          value={stage.opening_message ?? ''}
          onChange={(e) => setStage({ ...stage, opening_message: e.target.value })}
          rows={4}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={stage.is_active}
          onChange={(e) => setStage({ ...stage, is_active: e.target.checked })}
        />
        Stage is active
      </label>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {savedAt && (
          <span className="text-xs text-emerald-400">
            Saved at {savedAt.toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
      />
    </div>
  );
}
