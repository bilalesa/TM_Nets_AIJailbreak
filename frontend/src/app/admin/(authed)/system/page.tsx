// frontend/src/app/admin/(authed)/system/page.tsx

import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/adminAuth';
import { pool } from '@/lib/db';
import WipeButton from './WipeButton';

export const dynamic = 'force-dynamic';

interface LastWipe {
  created_at: string;
  details: Record<string, unknown> | null;
  admin_email?: string | null;
}

export default async function SystemPage() {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    redirect('/admin/login');
  }

  const isSuperAdmin = admin.role === 'super_admin';

  let lastWipe: LastWipe | null = null;
  if (isSuperAdmin) {
    const result = await pool.query(
      `SELECT a.created_at, a.details, au.email AS admin_email
       FROM admin_audit_log a
       LEFT JOIN admin_users au ON a.admin_id = au.id
       WHERE a.action = 'daily_wipe'
       ORDER BY a.created_at DESC
       LIMIT 1`,
    );
    const row = result.rows[0] ?? null;
    if (row) {
      lastWipe = {
        created_at: row.created_at as string,
        details: (row.details ?? null) as Record<string, unknown> | null,
        admin_email: (row.admin_email as string | null) ?? null,
      };
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">System</h1>
        <p className="mt-1 text-sm text-slate-400">
          Operational tools for managing the live game state.
        </p>
      </div>

      <section className="rounded-2xl border border-red-900/60 bg-red-950/20 p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-red-300">
            Danger zone
          </h2>
          <span className="rounded bg-red-950/60 px-2 py-0.5 text-xs uppercase tracking-wide text-red-300">
            super_admin
          </span>
        </div>

        <div className="space-y-2 text-sm text-slate-200">
          <p className="font-medium">Wipe all gameplay data</p>
          <ul className="ml-5 list-disc space-y-1 text-slate-400">
            <li>Deletes every row in <code>players</code> (cascades to completions and prompt logs).</li>
            <li>
              Deletes every row in <code>cracked_prompts</code> so the next
              booth session starts with a fresh anti-cheat hash list.
            </li>
            <li>Existing player JWT cookies will resolve to 401 PLAYER_GONE on next request.</li>
            <li>Cannot be undone. Run only at end-of-day or between booth sessions.</li>
          </ul>
        </div>

        {!isSuperAdmin && (
          <div className="mt-4 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-300">
            Only <code>super_admin</code> accounts can run this. Ask one to sign in.
          </div>
        )}

        {isSuperAdmin && (
          <div className="mt-5">
            <WipeButton />
          </div>
        )}

        {isSuperAdmin && (
          <div className="mt-6 border-t border-red-900/40 pt-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Last wipe</div>
            {lastWipe ? (
              <div className="mt-1 text-sm text-slate-300">
                <div>
                  {new Date(lastWipe.created_at).toLocaleString()}
                  {lastWipe.admin_email && (
                    <span className="text-slate-500"> · by {lastWipe.admin_email}</span>
                  )}
                </div>
                {lastWipe.details && (
                  <pre className="mt-2 overflow-x-auto rounded-md border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-300">
                    {JSON.stringify(lastWipe.details, null, 2)}
                  </pre>
                )}
              </div>
            ) : (
              <div className="mt-1 text-sm text-slate-500">No wipe has been recorded yet.</div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
