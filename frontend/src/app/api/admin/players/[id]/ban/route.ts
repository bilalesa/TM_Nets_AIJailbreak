import { NextRequest, NextResponse } from 'next/server';
import {
  AdminAuthError,
  extractClientIp,
  requireAdmin,
  writeAudit,
} from '@/lib/adminAuth';
import { pool } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const { reason } = (await request.json().catch(() => ({}))) as { reason?: unknown };
    const banReason = typeof reason === 'string' && reason.trim() ? reason.trim() : 'No reason provided';

    const result = await pool.query(
      `UPDATE players SET is_banned = true, banned_reason = $1
       WHERE id = $2
       RETURNING id, username`,
      [banReason, id],
    );

    const data = result.rows[0] ?? null;
    if (!data) return NextResponse.json({ error: 'Player not found' }, { status: 404 });

    await writeAudit(admin, {
      action: 'ban_player',
      targetType: 'player',
      targetId: id,
      details: { reason: banReason, username: data.username },
      ipAddress: extractClientIp(request.headers),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[admin/players/:id/ban]', err);
    return NextResponse.json({ error: 'Failed to ban player' }, { status: 500 });
  }
}
