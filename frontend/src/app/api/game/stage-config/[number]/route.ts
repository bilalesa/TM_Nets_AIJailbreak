// frontend/src/app/api/game/stage-config/[number]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getBackendBaseUrl } from '@/lib/backendUrl';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ number: string }> }
) {
  try {
    const { number } = await params;
    const res = await fetch(
      `${getBackendBaseUrl()}/api/game/stage-config/${number}`,
      { cache: 'no-store' }
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[/api/game/stage-config proxy]', err);
    return NextResponse.json({ error: 'Failed to load stage config' }, { status: 500 });
  }
}
