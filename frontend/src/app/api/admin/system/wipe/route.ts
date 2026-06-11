// frontend/src/app/api/admin/system/wipe/route.ts

import { NextRequest, NextResponse } from 'next/server';
import {
  AdminAuthError,
  extractClientIp,
  requireAdmin,
  requireRole,
  writeAudit,
} from '@/lib/adminAuth';
import { pool } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ['super_admin']);

    await pool.query('BEGIN');
    await pool.query('DELETE FROM cracked_prompts');
    await pool.query('DELETE FROM prompt_logs');
    await pool.query('DELETE FROM stage_completions');
    await pool.query('DELETE FROM players');
    await pool.query('COMMIT');

    const data = { wiped: true };

    await writeAudit(admin, {
      action: 'daily_wipe',
      targetType: 'system',
      targetId: null,
      details: data,
      ipAddress: extractClientIp(request.headers),
    });

    return NextResponse.json({ result: data });
  } catch (err) {
    // Attempt rollback on error
    try {
      await pool.query('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[admin/system/wipe POST]', err);
    return NextResponse.json({ error: 'Failed to perform daily wipe' }, { status: 500 });
  }
}
