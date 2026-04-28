import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, requireAdmin } from '@/lib/adminAuth';
import { getSupabaseServerClient } from '@/lib/supabaseClient';

const supabase = getSupabaseServerClient();

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? '25'), 200);
    const offset = Math.max(Number(url.searchParams.get('offset') ?? '0'), 0);
    const action = url.searchParams.get('action');
    const adminId = url.searchParams.get('adminId');

    let query = supabase
      .from('admin_audit_log')
      .select(
        'id, admin_id, action, target_type, target_id, details, ip_address, created_at, admin_users(email, name)',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (action) query = query.eq('action', action);
    if (adminId) query = query.eq('admin_id', adminId);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      entries: data ?? [],
      total: count ?? 0,
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
