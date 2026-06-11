// frontend/src/app/api/admin/system/wipe/route.ts
// Thin proxy: POST /api/admin/system/wipe

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getBackendBaseUrl } from '@/lib/backendUrl';

export async function POST(_request: NextRequest) {
  try {
    const adminToken = (await cookies()).get('admin_session_token')?.value;
    if (!adminToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const res = await fetch(`${getBackendBaseUrl()}/api/admin/system/wipe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      cache: 'no-store',
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[/api/admin/system/wipe proxy]', err);
    return NextResponse.json({ error: 'Failed to perform wipe' }, { status: 500 });
  }
}
