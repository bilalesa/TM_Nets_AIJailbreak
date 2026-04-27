// Auth-gated chrome for the admin console. /admin/login lives outside this
// route group and is therefore reachable while logged out.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAdminFromCookie } from '@/lib/adminAuth';
import { getSupabaseServerClient } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export default async function AuthedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getAdminFromCookie();
  if (!admin) redirect('/admin/login');

  // Re-check active flag against the database (mirrors requireAdmin server-side).
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from('admin_users')
    .select('is_active')
    .eq('id', admin.id)
    .maybeSingle();

  if (!data || !data.is_active) redirect('/admin/login');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-8">
            <Link href="/admin" className="text-lg font-semibold tracking-tight">
              Admin Console
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <NavLink href="/admin">Dashboard</NavLink>
              <NavLink href="/admin/players">Players</NavLink>
              <NavLink href="/admin/leaderboard">Leaderboard</NavLink>
              <NavLink href="/admin/stages">Stages</NavLink>
              <NavLink href="/admin/audit">Audit Log</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-400">
              {admin.email}
              <span className="ml-2 rounded bg-slate-800 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-300">
                {admin.role}
              </span>
            </span>
            <form action="/api/admin/logout" method="post">
              <button
                type="submit"
                className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium hover:bg-slate-800"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
    >
      {children}
    </Link>
  );
}
