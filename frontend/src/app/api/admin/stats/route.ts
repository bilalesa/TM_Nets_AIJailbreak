// frontend/src/app/api/admin/stats/route.ts
// Thin proxy: GET /api/admin/stats

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getBackendBaseUrl } from '@/lib/backendUrl';

export async function GET() {
  try {
    const adminToken = (await cookies()).get('admin_session_token')?.value;
    if (!adminToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const res = await fetch(`${getBackendBaseUrl()}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      cache: 'no-store',
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[/api/admin/stats proxy]', err);
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 });
  }
}
