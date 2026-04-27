// frontend/src/app/api/auth/verify/route.ts
// Submits the 6-digit code to the Express backend. On success, locks the JWT
// into an http-only cookie and broadcasts the player_joined event.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseServerClient } from '@/lib/supabaseClient';
import { getBackendBaseUrl } from '@/lib/backendUrl';

const supabase = getSupabaseServerClient();

async function broadcastPlayerJoined(username: string) {
  const channel = supabase.channel('leaderboard-updates');
  const safePayload = { username, sentAt: new Date().toISOString() };

  const maybeHttpSend = (
    channel as unknown as {
      httpSend?: (event: string, payload: unknown) => Promise<unknown>;
    }
  ).httpSend;
  if (typeof maybeHttpSend === 'function') {
    return maybeHttpSend.call(channel, 'player_joined', safePayload);
  }

  return channel.send({
    type: 'broadcast' as const,
    event: 'player_joined',
    payload: safePayload,
  });
}

export async function POST(request: Request) {
  try {
    const { email, code } = (await request.json()) as {
      email?: unknown;
      code?: unknown;
    };

    if (typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    if (typeof code !== 'string' || !code.trim()) {
      return NextResponse.json({ error: 'Code is required' }, { status: 400 });
    }

    const backendUrl = getBackendBaseUrl();
    const backendRes = await fetch(`${backendUrl}/api/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        code: code.trim(),
      }),
    });

    const data = await backendRes.json();

    if (!backendRes.ok) {
      return NextResponse.json(
        { error: data.error || 'Verification failed' },
        { status: backendRes.status },
      );
    }

    const cookieStore = await cookies();
    cookieStore.set({
      name: 'game_session_token',
      value: data.token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24,
      path: '/',
    });

    broadcastPlayerJoined(data.username)
      .then(() => {})
      .catch((err: unknown) => console.warn('[broadcast player_joined]', err));

    return NextResponse.json({ success: true, username: data.username });
  } catch (error) {
    console.error('[/api/auth/verify]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
