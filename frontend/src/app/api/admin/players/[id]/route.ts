import { NextRequest, NextResponse } from 'next/server';
import {
  AdminAuthError,
  extractClientIp,
  requireAdmin,
  requireRole,
  writeAudit,
} from '@/lib/adminAuth';
import { pool } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;

    const [playerRes, completionsRes, promptsRes] = await Promise.all([
      pool.query(
        `SELECT id, username, total_score, is_banned, banned_reason, created_at,
                registration_ip, client_fingerprint, session_active
         FROM players
         WHERE id = $1
         LIMIT 1`,
        [id],
      ),
      pool.query(
        `SELECT stage_number, score_awarded, time_taken_seconds, started_at, submitted_at,
                completed_at, client_fingerprint
         FROM stage_completions
         WHERE player_id = $1
         ORDER BY stage_number ASC`,
        [id],
      ),
      pool.query(
        `SELECT id, stage_number, prompt_text, ai_response, is_successful, is_blocked_by_anticheat, created_at
         FROM prompt_logs
         WHERE player_id = $1
         ORDER BY created_at DESC
         LIMIT 100`,
        [id],
      ),
    ]);

    const player = playerRes.rows[0] ?? null;
    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    return NextResponse.json({
      player,
      completions: completionsRes.rows,
      promptLogs: promptsRes.rows,
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

    await pool.query('DELETE FROM players WHERE id = $1', [id]);

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
