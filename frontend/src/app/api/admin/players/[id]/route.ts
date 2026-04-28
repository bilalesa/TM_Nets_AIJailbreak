import { NextRequest, NextResponse } from 'next/server';
import {
  AdminAuthError,
  extractClientIp,
  requireAdmin,
  requireRole,
  writeAudit,
} from '@/lib/adminAuth';
import { getSupabaseServerClient } from '@/lib/supabaseClient';

const supabase = getSupabaseServerClient();

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;

    const [{ data: player, error: playerError }, { data: completions }, { data: prompts }] =
      await Promise.all([
        supabase
          .from('players')
          .select(
            'id, username, total_score, is_banned, banned_reason, created_at, registration_ip, client_fingerprint, session_active',
          )
          .eq('id', id)
          .maybeSingle(),
        supabase
          .from('stage_completions')
          .select(
            'stage_number, score_awarded, time_taken_seconds, started_at, submitted_at, completed_at, client_fingerprint',
          )
          .eq('player_id', id)
          .order('stage_number', { ascending: true }),
        supabase
          .from('prompt_logs')
          .select('id, stage_number, prompt_text, ai_response, is_successful, is_blocked_by_anticheat, created_at')
          .eq('player_id', id)
          .order('created_at', { ascending: false })
          .limit(100),
      ]);

    if (playerError) throw playerError;
    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    return NextResponse.json({
      player,
      completions: completions ?? [],
      promptLogs: prompts ?? [],
    });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[admin/players/:id GET]', err);
    return NextResponse.json({ error: 'Failed to load player' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ['super_admin']);
    const { id } = await context.params;

    const { error } = await supabase.from('players').delete().eq('id', id);
    if (error) throw error;

    await writeAudit(admin, {
      action: 'delete_player',
      targetType: 'player',
      targetId: id,
      ipAddress: extractClientIp(request.headers),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[admin/players/:id DELETE]', err);
    return NextResponse.json({ error: 'Failed to delete player' }, { status: 500 });
  }
}
