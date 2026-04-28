// frontend/src/lib/playerSession.ts
//
// Player JWT validation + post-wipe handling.
//
// Background: player JWTs live for 24h. The daily wipe (Phase 3a) and the
// admin "delete player" action both remove the underlying player row while
// the cookie is still cryptographically valid. If the player then makes a
// game request, naive `.single()` lookups on `players` throw, and the
// route returns a generic 500 — confusing both the player and the
// frontend's existing 401-redirect path.
//
// `getPlayerFromCookie()` consolidates the three checks every game endpoint
// needs (cookie present? signature valid? player still in DB?) and, on any
// failure, returns a ready-to-return NextResponse:
//   - 401 PLAYER_GONE         — JWT valid but player row missing (post-wipe)
//   - 401 INVALID_SESSION     — JWT signature failed
//   - 401 (no code)           — no cookie at all
//
// In the PLAYER_GONE / INVALID_SESSION cases the helper also clears the
// game_session_token cookie on the response so the next request from the
// browser doesn't loop on the same stale token.

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

  // Confirm the player still exists. A daily wipe (or admin delete) can
  // remove the row mid-token; without this check every downstream query
  // either silently succeeds against a deleted player_id or 500s on
  // `.single()`.
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
