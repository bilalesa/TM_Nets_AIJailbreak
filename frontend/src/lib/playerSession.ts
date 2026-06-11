// frontend/src/lib/playerSession.ts
// Verifies the game session JWT locally (no DB round-trip — the backend handles DB validation).

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

export const GAME_COOKIE_NAME = 'game_session_token';

export interface PlayerClaims {
  id: string;
  username: string;
}

export type PlayerSessionResult =
  | { ok: true; player: PlayerClaims }
  | { ok: false; response: NextResponse };

function clearedSessionResponse(message: string, code: string): NextResponse {
  const res = NextResponse.json({ error: message, code }, { status: 401 });
  res.cookies.delete(GAME_COOKIE_NAME);
  return res;
}

export async function getPlayerFromCookie(): Promise<PlayerSessionResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(GAME_COOKIE_NAME)?.value;
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }),
    };
  }

  let decoded: PlayerClaims;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET!) as PlayerClaims;
  } catch {
    return { ok: false, response: clearedSessionResponse('Invalid session', 'INVALID_SESSION') };
  }

  return { ok: true, player: decoded };
}
