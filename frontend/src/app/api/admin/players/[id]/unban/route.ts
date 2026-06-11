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

    const result = await pool.query(
      `UPDATE players SET is_banned = false, banned_reason = NULL
       WHERE id = $1
       RETURNING id, username`,
      [id],
    );

    const data = result.rows[0] ?? null;
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
