// frontend/src/app/api/admin/stages/[number]/route.ts
// Thin proxy: GET/PATCH /api/admin/stages/:number

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getBackendBaseUrl } from '@/lib/backendUrl';

interface RouteContext {
  params: Promise<{ number: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const adminToken = (await cookies()).get('admin_session_token')?.value;
    if (!adminToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { number } = await context.params;

    const res = await fetch(`${getBackendBaseUrl()}/api/admin/stages/${number}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      cache: 'no-store',
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[/api/admin/stages/:number GET proxy]', err);
    return NextResponse.json({ error: 'Failed to load stage' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const adminToken = (await cookies()).get('admin_session_token')?.value;
    if (!adminToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { number } = await context.params;
    const body = await request.json();

    const res = await fetch(`${getBackendBaseUrl()}/api/admin/stages/${number}`, {
      method: 'PATCH',
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
    console.error('[/api/admin/stages/:number PATCH proxy]', err);
    return NextResponse.json({ error: 'Failed to update stage' }, { status: 500 });
  }
}
