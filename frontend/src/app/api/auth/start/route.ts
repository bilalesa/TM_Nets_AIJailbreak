// frontend/src/app/api/auth/start/route.ts
// Forwards { username, email } to the Express backend, which immediately
// issues a JWT. The token is stored as an http-only cookie.

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
    const body = await request.json();
    const { username, email, fingerprint } = body as {
      username?: unknown;
      email?: unknown;
      fingerprint?: unknown;
    };

    if (!username || typeof username !== 'string' || !username.trim()) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }
    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const backendUrl = getBackendBaseUrl();

    // Forward the original client IP so the backend (with trust proxy) can
    // record it on the player row.
    const forwardHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const xff = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    if (xff) forwardHeaders['x-forwarded-for'] = xff;
    if (realIp) forwardHeaders['x-real-ip'] = realIp;

    const backendRes = await fetch(`${backendUrl}/api/auth/start`, {
      method: 'POST',
      headers: forwardHeaders,
      body: JSON.stringify({
        username: username.trim(),
        email: email.trim().toLowerCase(),
        fingerprint:
          typeof fingerprint === 'string' ? fingerprint.trim().slice(0, 256) : undefined,
      }),
    });

    const data = await backendRes.json();

    if (!backendRes.ok) {
      return NextResponse.json(
        { error: data.error || 'Backend error' },
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
    console.error('[/api/auth/start]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
