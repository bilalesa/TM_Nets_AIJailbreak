// frontend/src/app/api/admin/logout/route.ts
// Clears the admin session cookie. DB audit is handled by the backend on each proxied action.

import { NextResponse } from 'next/server';
import { clearAdminCookie } from '@/lib/adminAuth';

export async function POST() {
  await clearAdminCookie();
  return NextResponse.json({ success: true });
}
