// frontend/src/app/api/admin/players/route.ts
// Thin proxy: forwards to backend GET /api/admin/players

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getBackendBaseUrl } from '@/lib/backendUrl';

export async function GET(request: NextRequest) {
  try {
    const adminToken = (await cookies()).get('admin_session_token')?.value;
    if (!adminToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(`${getBackendBaseUrl()}/api/admin/players`);
    const searchParams = request.nextUrl.searchParams;
    searchParams.forEach((value, key) => url.searchParams.set(key, value));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${adminToken}` },
      cache: 'no-store',
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[/api/admin/players proxy]', err);
    return NextResponse.json({ error: 'Failed to load players' }, { status: 500 });
  }
}
