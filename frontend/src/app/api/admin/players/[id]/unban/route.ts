import { NextRequest, NextResponse } from 'next/server';
import {
  AdminAuthError,
  extractClientIp,
  requireAdmin,
  writeAudit,
} from '@/lib/adminAuth';
import { getSupabaseServerClient } from '@/lib/supabaseClient';

const supabase = getSupabaseServerClient();

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;

    const { data, error } = await supabase
      .from('players')
      .update({ is_banned: false, banned_reason: null })
      .eq('id', id)
      .select('id, username')
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Player not found' }, { status: 404 });

    await writeAudit(admin, {
      action: 'unban_player',
      targetType: 'player',
      targetId: id,
      details: { username: data.username },
      ipAddress: extractClientIp(request.headers),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[admin/players/:id/unban]', err);
    return NextResponse.json({ error: 'Failed to unban player' }, { status: 500 });
  }
}
