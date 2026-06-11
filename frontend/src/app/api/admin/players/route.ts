import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, requireAdmin } from '@/lib/adminAuth';
import { pool } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const url = new URL(request.url);
    const search = url.searchParams.get('search')?.trim() ?? '';
    const limit = Math.min(Number(url.searchParams.get('limit') ?? '25'), 100);
    const offset = Math.max(Number(url.searchParams.get('offset') ?? '0'), 0);
    const filter = url.searchParams.get('filter') ?? 'all'; // 'all' | 'banned' | 'active'

    const conditions: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    if (search) {
      conditions.push(`username ILIKE $${p++}`);
      values.push(`%${search}%`);
    }
    if (filter === 'banned') {
      conditions.push(`is_banned = $${p++}`);
      values.push(true);
    }
    if (filter === 'active') {
      conditions.push(`is_banned = $${p++}`);
      values.push(false);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count query
    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM players ${where}`,
      values,
    );
    const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

    // Data query
    const dataValues = [...values, limit, offset];
    const dataResult = await pool.query(
      `SELECT id, username, total_score, is_banned, banned_reason, created_at, registration_ip, client_fingerprint
       FROM players
       ${where}
       ORDER BY created_at DESC
       LIMIT $${p++} OFFSET $${p++}`,
      dataValues,
    );

    return NextResponse.json({
      players: dataResult.rows,
      total,
      limit,
      offset,
    });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[admin/players]', err);
    return NextResponse.json({ error: 'Failed to load players' }, { status: 500 });
  }
}
