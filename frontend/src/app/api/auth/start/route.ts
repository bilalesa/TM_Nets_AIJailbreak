// frontend/src/app/api/auth/start/route.ts
// Forwards { username, email } to the Express backend, which sends a 6-digit
// verification code via email. No JWT is issued at this step — the client must
// follow up with POST /api/auth/verify.

import { NextResponse } from 'next/server';
import { getBackendBaseUrl } from '@/lib/backendUrl';

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

    return NextResponse.json({
      verificationRequired: true,
      email: data.email,
      expiresInSeconds: data.expiresInSeconds,
    });
  } catch (error) {
    console.error('[/api/auth/start]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
