import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 1. Forward the request to your EC2 Express Backend
    // (Use localhost for now, swap to your EC2 IP in production)
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    
    const backendRes = await fetch(`${backendUrl}/api/auth/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await backendRes.json();

    if (!backendRes.ok) {
      return NextResponse.json({ error: data.error }, { status: backendRes.status });
    }

    // 2. Take the token from Express and lock it in an HTTP-Only Cookie
    const cookieStore = await cookies();
    cookieStore.set({
      name: 'game_session_token',
      value: data.token,
      httpOnly: true,     // JavaScript cannot read this (Zero XSS risk)
      secure: true,       // Only sent over HTTPS
      sameSite: 'strict', // Prevents CSRF attacks
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    });

    // 3. Return success to the frontend (without exposing the token)
    return NextResponse.json({ success: true, username: data.username });

  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}