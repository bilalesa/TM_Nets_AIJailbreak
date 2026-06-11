// frontend/src/app/api/admin/players/[id]/unban/route.ts
// Thin proxy: POST /api/admin/players/:id/unban

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

    const res = await fetch(`${getBackendBaseUrl()}/api/admin/players/${id}/unban`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      cache: 'no-store',
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[/api/admin/players/:id/unban proxy]', err);
    return NextResponse.json({ error: 'Failed to unban player' }, { status: 500 });
  }
}
