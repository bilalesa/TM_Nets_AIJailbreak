// frontend/src/app/api/game/stage-history/route.ts
// Thin proxy: forwards request to backend GET /api/players/stage-history?stage=N

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getBackendBaseUrl } from '@/lib/backendUrl';

export async function GET(request: NextRequest) {
  try {
    const token = (await cookies()).get('game_session_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const stageParam = request.nextUrl.searchParams.get('stage');
    const url = new URL(`${getBackendBaseUrl()}/api/players/stage-history`);
    if (stageParam !== null) url.searchParams.set('stage', stageParam);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[/api/game/stage-history proxy]', err);
    return NextResponse.json({ error: 'Failed to load stage history' }, { status: 500 });
  }
}
