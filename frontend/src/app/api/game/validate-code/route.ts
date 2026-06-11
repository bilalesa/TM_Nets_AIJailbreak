// frontend/src/app/api/game/validate-code/route.ts
// Thin proxy: forwards to backend POST /api/games/validate-code,
// then broadcasts a Supabase Realtime event if the code was correct.

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { getBackendBaseUrl } from '@/lib/backendUrl';

// Create a fresh Supabase client for Realtime broadcasts only (no DB access).
function getRealtimeClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

async function broadcastScoreUpdated(payload: {
  playerId: string;
  stageNumber: number;
  scoreAwarded: number;
}) {
  const supabase = getRealtimeClient();
  const channel = supabase.channel('leaderboard-updates');
  const safePayload = {
    playerId: payload.playerId,
    stageNumber: payload.stageNumber,
    scoreAwarded: payload.scoreAwarded,
    sentAt: new Date().toISOString(),
  };

  const maybeHttpSend = (
    channel as unknown as { httpSend?: (event: string, payload: unknown) => Promise<unknown> }
  ).httpSend;
  if (typeof maybeHttpSend === 'function') {
    return maybeHttpSend.call(channel, 'score_updated', safePayload);
  }

  return channel.send({
    type: 'broadcast' as const,
    event: 'score_updated',
    payload: safePayload,
  });
}

export async function POST(request: NextRequest) {
  try {
    const token = (await cookies()).get('game_session_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body = await request.json();

    const res = await fetch(`${getBackendBaseUrl()}/api/games/validate-code`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const data = await res.json() as {
      correct?: boolean;
      alreadyCompleted?: boolean;
      scoreAwarded?: number;
      playerId?: string;
      stageNumber?: number;
    };

    // Broadcast score_updated event if the submission was a fresh correct answer
    if (res.ok && data.correct && !data.alreadyCompleted && data.scoreAwarded !== undefined) {
      // playerId is not returned by the backend (no need to leak it); decode from token
      // We can get the player ID from the JWT payload (public claim, already trusted by backend)
      const tokenPayload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString('utf-8'),
      ) as { id?: string };
      const playerId = tokenPayload.id;
      const stageNumber = body.stageNumber as number | undefined;

      if (playerId && typeof stageNumber === 'number') {
        broadcastScoreUpdated({
          playerId,
          stageNumber,
          scoreAwarded: data.scoreAwarded,
        })
          .then(() => {})
          .catch((err: unknown) => console.warn('[broadcast score_updated]', err));
      }
    }

    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[/api/game/validate-code proxy]', err);
    return NextResponse.json({ error: 'Failed to validate code' }, { status: 500 });
  }
}
