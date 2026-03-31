import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getBackendBaseUrl } from '@/lib/backendUrl';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('game_session_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized: No session token' }, { status: 401 });
    }

    const backendUrl = getBackendBaseUrl();
    const backendRes = await fetch(`${backendUrl}/api/players/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    const data = await backendRes.json();

    if (!backendRes.ok) {
      return NextResponse.json(
        { error: data.error || 'Backend error' },
        { status: backendRes.status },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[/api/players/me]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
