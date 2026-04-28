// frontend/src/app/api/auth/recover/route.ts
// Proxies { username, recoveryCode } to the Express backend. On success the
// backend re-issues a JWT, which we set as an http-only cookie just like
// /api/auth/start.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getBackendBaseUrl } from '@/lib/backendUrl';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, recoveryCode, fingerprint } = body as {
      username?: unknown;
      recoveryCode?: unknown;
      fingerprint?: unknown;
    };

    if (!username || typeof username !== 'string' || !username.trim()) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }
    if (!recoveryCode || typeof recoveryCode !== 'string' || !recoveryCode.trim()) {
      return NextResponse.json({ error: 'Recovery code is required' }, { status: 400 });
    }

    const backendUrl = getBackendBaseUrl();
    const forwardHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const xff = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    if (xff) forwardHeaders['x-forwarded-for'] = xff;
    if (realIp) forwardHeaders['x-real-ip'] = realIp;

    const backendRes = await fetch(`${backendUrl}/api/auth/recover`, {
      method: 'POST',
      headers: forwardHeaders,
      body: JSON.stringify({
        username: username.trim(),
        recoveryCode: recoveryCode.trim(),
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

    return NextResponse.json({ success: true, username: data.username });
  } catch (error) {
    console.error('[/api/auth/recover]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
