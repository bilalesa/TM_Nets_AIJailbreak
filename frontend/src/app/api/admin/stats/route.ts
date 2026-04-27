import { NextResponse } from 'next/server';
import { AdminAuthError, requireAdmin } from '@/lib/adminAuth';
import { getSupabaseServerClient } from '@/lib/supabaseClient';

const supabase = getSupabaseServerClient();

export async function GET() {
  try {
    await requireAdmin();

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [
      playersTotal,
      playersBanned,
      playersRecent,
      completionsTotal,
      promptsTotal,
      stageBreakdown,
    ] = await Promise.all([
      supabase.from('players').select('*', { count: 'exact', head: true }),
      supabase.from('players').select('*', { count: 'exact', head: true }).eq('is_banned', true),
      supabase
        .from('players')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', since24h),
      supabase.from('stage_completions').select('*', { count: 'exact', head: true }),
      supabase.from('prompt_logs').select('*', { count: 'exact', head: true }).gte('created_at', since24h),
      supabase.from('stage_completions').select('stage_number'),
    ]);

    const counts: Record<number, number> = {};
    for (const row of stageBreakdown.data ?? []) {
      const n = (row as { stage_number: number }).stage_number;
      counts[n] = (counts[n] ?? 0) + 1;
    }

    return NextResponse.json({
      players: {
        total: playersTotal.count ?? 0,
        banned: playersBanned.count ?? 0,
        joinedLast24h: playersRecent.count ?? 0,
      },
      completions: {
        total: completionsTotal.count ?? 0,
        byStage: counts,
      },
      activity: {
        promptsLast24h: promptsTotal.count ?? 0,
      },
    });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[admin/stats]', err);
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 });
  }
}
