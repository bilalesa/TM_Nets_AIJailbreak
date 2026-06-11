// Auth-gated chrome for the admin console. /admin/login lives outside this
// route group and is therefore reachable while logged out.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAdminFromCookie } from '@/lib/adminAuth';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function AuthedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getAdminFromCookie();
  if (!admin) redirect('/admin/login');

  // Re-check active flag against the database (mirrors requireAdmin server-side).
  const result = await pool.query(
    'SELECT is_active FROM admin_users WHERE id = $1 LIMIT 1',
    [admin.id],
  );
  const row = result.rows[0] ?? null;

  if (!row || !row.is_active) redirect('/admin/login');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 flex-1 items-center gap-4 sm:gap-8">
            <Link
              href="/admin"
              className="shrink-0 text-base font-semibold tracking-tight sm:text-lg"
            >
              Admin Console
            </Link>
            {/* Nav scrolls horizontally on mobile so links never wrap or get cut off */}
            <nav className="-mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <NavLink href="/admin">Dashboard</NavLink>
              <NavLink href="/admin/players">Players</NavLink>
              <NavLink href="/admin/leaderboard">Leaderboard</NavLink>
              <NavLink href="/admin/stages">Stages</NavLink>
              <NavLink href="/admin/audit">Audit Log</NavLink>
              {admin.role === 'super_admin' && (
                <NavLink href="/admin/system">System</NavLink>
              )}
            </nav>
          </div>
          <div className="flex w-full items-center justify-between gap-3 text-sm sm:w-auto sm:justify-end">
            <span className="min-w-0 truncate text-slate-400">
              <span className="truncate align-middle">{admin.email}</span>
              <span className="ml-2 rounded bg-slate-800 px-2 py-0.5 align-middle text-xs uppercase tracking-wide text-slate-300">
                {admin.role}
              </span>
            </span>
            <form action="/api/admin/logout" method="post" className="shrink-0">
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
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
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
