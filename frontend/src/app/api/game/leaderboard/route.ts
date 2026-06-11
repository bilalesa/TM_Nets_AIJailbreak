// frontend/src/app/api/game/leaderboard/route.ts
// Thin proxy: GET /api/games/leaderboard
// Returns top 10 leaderboard entries + total player count for active, non-banned players.

import { NextResponse } from 'next/server';
import { getBackendBaseUrl } from '@/lib/backendUrl';

export async function GET() {
  try {
    const res = await fetch(`${getBackendBaseUrl()}/api/games/leaderboard`, {
      cache: 'no-store',
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: unknown) {
    console.error('[/api/game/leaderboard proxy]', error);
    return NextResponse.json({ error: 'Failed to load leaderboard' }, { status: 500 });
  }
}
