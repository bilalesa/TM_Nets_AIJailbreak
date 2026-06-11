// frontend/src/app/api/admin/login/route.ts
// Thin proxy: forwards to backend POST /api/admin/login, sets admin_session_token cookie.

import { NextRequest, NextResponse } from 'next/server';
import { setAdminCookie } from '@/lib/adminAuth';
import { getBackendBaseUrl } from '@/lib/backendUrl';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const res = await fetch(`${getBackendBaseUrl()}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const data = await res.json() as { success?: boolean; token?: string; admin?: unknown; error?: string };

    if (!res.ok || !data.success || !data.token) {
      return NextResponse.json(
        { error: data.error ?? 'Login failed' },
        { status: res.status },
      );
    }

    // Set the httpOnly cookie from the token returned by the backend
    await setAdminCookie(data.token);

    return NextResponse.json({
      success: true,
      admin: data.admin,
    });
  } catch (err) {
    console.error('[/api/admin/login proxy]', err);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
