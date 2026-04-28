import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, requireAdmin } from '@/lib/adminAuth';
import { getSupabaseServerClient } from '@/lib/supabaseClient';

const supabase = getSupabaseServerClient();

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const url = new URL(request.url);
    const search = url.searchParams.get('search')?.trim() ?? '';
    const limit = Math.min(Number(url.searchParams.get('limit') ?? '25'), 100);
    const offset = Math.max(Number(url.searchParams.get('offset') ?? '0'), 0);
    const filter = url.searchParams.get('filter') ?? 'all'; // 'all' | 'banned' | 'active'

    let query = supabase
      .from('players')
      .select(
        'id, username, email, total_score, is_banned, banned_reason, is_verified, created_at, registration_ip, client_fingerprint',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(`username.ilike.%${search}%,email.ilike.%${search}%`);
    }
    if (filter === 'banned') query = query.eq('is_banned', true);
    if (filter === 'active') query = query.eq('is_banned', false);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      players: data ?? [],
      total: count ?? 0,
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
