// frontend/src/lib/playerSession.ts

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import type { SupabaseClient } from '@supabase/supabase-js';

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

export async function getPlayerFromCookie(
  supabase: SupabaseClient,
): Promise<PlayerSessionResult> {
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

  // Confirm the player still exists. 
  const { data, error } = await supabase
    .from('players')
    .select('id')
    .eq('id', decoded.id)
    .maybeSingle();

  if (error) {
    console.error('[getPlayerFromCookie] player lookup failed', error);
    return {
      ok: false,
      response: NextResponse.json({ error: 'Failed to validate session' }, { status: 500 }),
    };
  }
  if (!data) {
    return { ok: false, response: clearedSessionResponse('Session expired', 'PLAYER_GONE') };
  }

  return { ok: true, player: decoded };
}
