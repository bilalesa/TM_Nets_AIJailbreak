// frontend/src/app/api/admin/players/[id]/ban/route.ts
// Thin proxy: POST /api/admin/players/:id/ban

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getBackendBaseUrl } from '@/lib/backendUrl';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const adminToken = (await cookies()).get('admin_session_token')?.value;
    if (!adminToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));

    const res = await fetch(`${getBackendBaseUrl()}/api/admin/players/${id}/ban`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[/api/admin/players/:id/ban proxy]', err);
    return NextResponse.json({ error: 'Failed to ban player' }, { status: 500 });
  }
}
