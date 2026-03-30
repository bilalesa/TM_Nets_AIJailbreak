// frontend/src/app/api/game/player/route.ts
// Returns the current player's profile + which stages they've completed.
// Used on initial load to hydrate the sidebar state.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('game_session_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    let decoded: { id: string; username: string };
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
        id: string;
        username: string;
      };
    } catch {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Fetch player + completions in parallel
    const [playerRes, completionsRes] = await Promise.all([
      supabase
        .from('players')
        .select('id, username, total_score, created_at')
        .eq('id', decoded.id)
        .single(),
      supabase
        .from('stage_completions')
        .select('stage_number, score_awarded, time_taken_seconds, completed_at')
        .eq('player_id', decoded.id)
        .order('stage_number', { ascending: true }),
    ]);

    if (playerRes.error) throw playerRes.error;

    return NextResponse.json({
      player: playerRes.data,
      completedStages: (completionsRes.data ?? []).map((c) => c.stage_number),
      completions: completionsRes.data ?? [],
    });
  } catch (error: unknown) {
    console.error('[/api/game/player]', error);
    return NextResponse.json({ error: 'Failed to load player profile' }, { status: 500 });
  }
}