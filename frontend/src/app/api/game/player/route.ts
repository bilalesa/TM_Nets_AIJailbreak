// frontend/src/app/api/game/player/route.ts
// Returns the current player's profile + which stages they've completed.
// Used on initial load to hydrate the sidebar state.

import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseClient';
import { getPlayerFromCookie } from '@/lib/playerSession';

const supabase = getSupabaseServerClient();

export async function GET() {
  try {
    const session = await getPlayerFromCookie(supabase);
    if (!session.ok) return session.response;
    const { player } = session;

    // Fetch player + completions in parallel. Player existence was already
    // confirmed by getPlayerFromCookie, so .maybeSingle() with a null check
    // is just defence in depth against a race with admin delete.
    const [playerRes, completionsRes] = await Promise.all([
      supabase
        .from('players')
        .select('id, username, total_score, created_at')
        .eq('id', player.id)
        .maybeSingle(),
      supabase
        .from('stage_completions')
        .select('stage_number, score_awarded, time_taken_seconds, completed_at')
        .eq('player_id', player.id)
        .order('stage_number', { ascending: true }),
    ]);

    if (playerRes.error) throw playerRes.error;
    if (!playerRes.data) {
      return NextResponse.json(
        { error: 'Session expired', code: 'PLAYER_GONE' },
        { status: 401 },
      );
    }

    return NextResponse.json({
      player: playerRes.data,
      completedStages: (completionsRes.data ?? []).map(
        (c: { stage_number: number }) => c.stage_number,
      ),
      completions: completionsRes.data ?? [],
    });
  } catch (error: unknown) {
    console.error('[/api/game/player]', error);
    return NextResponse.json({ error: 'Failed to load player profile' }, { status: 500 });
  }
}
