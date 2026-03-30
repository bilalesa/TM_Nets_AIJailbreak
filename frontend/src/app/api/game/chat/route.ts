import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const DEFAULT_BACKEND_URL = 'http://localhost:3001';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('game_session_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body = await request.json();
    const backendUrl = process.env.BACKEND_URL || DEFAULT_BACKEND_URL;

    const backendRes = await fetch(`${backendUrl}/api/games/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const data = await backendRes.json();
    return NextResponse.json(data, {
      status: backendRes.status,
      headers: backendRes.status === 503 ? { 'Retry-After': '2' } : undefined,
    });
  } catch (error: unknown) {
    console.error('[/api/game/chat proxy]', error);
    return NextResponse.json({ error: 'Failed to get AI response' }, { status: 500 });
  }
}
