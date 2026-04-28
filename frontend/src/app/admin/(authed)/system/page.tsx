// frontend/src/app/admin/(authed)/system/page.tsx
//
// "Danger zone" admin tools. Currently exposes a manual trigger for the
// daily wipe so super_admins can reset all gameplay data without dropping
// into the Supabase SQL editor. The actual destructive call goes through
// the existing POST /api/admin/system/wipe endpoint, which already handles
// auth, role-checking, and audit logging.
//
// Server-rendered shell: enforces super_admin (others see a friendly
// "ask a super admin" notice) and fetches the most recent daily_wipe
// audit entry so the page can show "last wiped at …". The destructive
// button itself is a small client island.
//
// Page is intentionally only linked from the admin nav for super_admins
// — see (authed)/layout.tsx — but the role gate here is the source of
// truth in case a moderator pokes the URL directly.
//
// Forensic snapshot tooling (pre-wipe row counts, dry-run preview) lives
// outside this page; if/when Phase 3c lands it can extend the same shell.
//
// IMPORTANT: this page is dynamic. Audit log freshness matters — we don't
// want a CDN-cached "last wiped 6h ago" after the admin just clicked.

import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/adminAuth';
import { getSupabaseServerClient } from '@/lib/supabaseClient';
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
    const supabase = getSupabaseServerClient();
    const { data } = await supabase
      .from('admin_audit_log')
      .select('created_at, details, admin_users(email)')
      .eq('action', 'daily_wipe')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      // Supabase returns the joined row as either an object or array
      // depending on whether the FK is single-valued. Normalise.
      const joined = (data as { admin_users?: { email: string } | { email: string }[] | null })
        .admin_users;
      const email = Array.isArray(joined) ? joined[0]?.email ?? null : joined?.email ?? null;
      lastWipe = {
        created_at: data.created_at as string,
        details: (data.details ?? null) as Record<string, unknown> | null,
        admin_email: email,
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
