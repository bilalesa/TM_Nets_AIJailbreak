// frontend/src/app/api/game/player/route.ts
// Thin proxy: forwards request to backend GET /api/players/profile

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getBackendBaseUrl } from '@/lib/backendUrl';

export async function GET() {
  try {
    const token = (await cookies()).get('game_session_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const res = await fetch(`${getBackendBaseUrl()}/api/players/profile`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[/api/game/player proxy]', err);
    return NextResponse.json({ error: 'Failed to load player profile' }, { status: 500 });
  }
}
