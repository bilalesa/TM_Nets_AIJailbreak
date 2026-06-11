import { NextResponse } from 'next/server';
import { AdminAuthError, requireAdmin } from '@/lib/adminAuth';
import { pool } from '@/lib/db';

export async function GET() {
  try {
    await requireAdmin();

    const result = await pool.query(
      `SELECT id, stage_number, name, subtitle, base_xp, secret_code, system_prompt,
              opening_message, is_active, updated_at, updated_by
       FROM stage_configs
       ORDER BY stage_number ASC`,
    );

    return NextResponse.json({ stages: result.rows });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[admin/stages GET]', err);
    return NextResponse.json({ error: 'Failed to load stages' }, { status: 500 });
  }
}
