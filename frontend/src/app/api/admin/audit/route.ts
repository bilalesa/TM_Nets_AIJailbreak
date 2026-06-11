import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, requireAdmin } from '@/lib/adminAuth';
import { pool } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? '25'), 200);
    const offset = Math.max(Number(url.searchParams.get('offset') ?? '0'), 0);
    const action = url.searchParams.get('action');
    const adminId = url.searchParams.get('adminId');

    const conditions: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    if (action) {
      conditions.push(`a.action = $${p++}`);
      values.push(action);
    }
    if (adminId) {
      conditions.push(`a.admin_id = $${p++}`);
      values.push(adminId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count query
    const countResult = await pool.query(
      `SELECT COUNT(*) AS total
       FROM admin_audit_log a
       ${where}`,
      values,
    );
    const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

    // Data query with JOIN
    const dataValues = [...values, limit, offset];
    const dataResult = await pool.query(
      `SELECT a.id, a.admin_id, a.action, a.target_type, a.target_id, a.details, a.ip_address, a.created_at,
              json_build_object('email', au.email, 'name', au.name) AS admin_users
       FROM admin_audit_log a
       LEFT JOIN admin_users au ON a.admin_id = au.id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $${p++} OFFSET $${p++}`,
      dataValues,
    );

    return NextResponse.json({
      entries: dataResult.rows,
      total,
      limit,
      offset,
    });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[admin/audit]', err);
    return NextResponse.json({ error: 'Failed to load audit log' }, { status: 500 });
  }
}
