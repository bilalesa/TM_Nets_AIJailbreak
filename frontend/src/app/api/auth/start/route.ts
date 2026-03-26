// frontend/src/app/api/auth/start/route.ts
// This is the Next.js proxy layer that:
// 1. Forwards the username to the Express backend
// 2. Stores the returned JWT in an HTTP-Only cookie (safe from XSS)
// 3. Handles duplicate username conflicts

/// <reference types="next" />
/// <reference types="node" />

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username } = body;

    if (!username || typeof username !== 'string' || !username.trim()) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 },
      );
    }

    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';

    const backendRes = await fetch(`${backendUrl}/api/auth/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim() }),
    });

    const data = await backendRes.json();

    if (!backendRes.ok) {
      // Propagate the error (including 409 duplicate) straight through
      return NextResponse.json(
        { error: data.error || 'Backend error' },
        { status: backendRes.status },
      );
    }

    // Lock the JWT into an HTTP-Only cookie — never exposed to client JS
    const cookieStore = await cookies();
    cookieStore.set({
      name: 'game_session_token',
      value: data.token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    });

    // Return only what the frontend needs — never expose the raw JWT
    return NextResponse.json({
      success: true,
      username: data.username,
    });
  } catch (error) {
    console.error('[/api/auth/start]', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}