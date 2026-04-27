import { NextResponse } from 'next/server';
import { AdminAuthError, requireAdmin } from '@/lib/adminAuth';
import { getSupabaseServerClient } from '@/lib/supabaseClient';

const supabase = getSupabaseServerClient();

export async function GET() {
  try {
    await requireAdmin();

    const { data, error } = await supabase
      .from('stage_configs')
      .select('id, stage_number, name, subtitle, base_xp, secret_code, system_prompt, opening_message, is_active, updated_at, updated_by')
      .order('stage_number', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ stages: data ?? [] });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[admin/stages GET]', err);
    return NextResponse.json({ error: 'Failed to load stages' }, { status: 500 });
  }
}
