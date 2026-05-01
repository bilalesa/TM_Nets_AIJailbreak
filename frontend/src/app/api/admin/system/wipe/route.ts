// frontend/src/app/api/admin/system/wipe/route.ts

import { NextRequest, NextResponse } from 'next/server';
import {
  AdminAuthError,
  extractClientIp,
  requireAdmin,
  requireRole,
  writeAudit,
} from '@/lib/adminAuth';
import { getSupabaseServerClient } from '@/lib/supabaseClient';

const supabase = getSupabaseServerClient();

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ['super_admin']);

    const { data, error } = await supabase.rpc('daily_wipe');
    if (error) throw error;

    await writeAudit(admin, {
      action: 'daily_wipe',
      targetType: 'system',
      targetId: null,
      details: (data ?? null) as Record<string, unknown> | null,
      ipAddress: extractClientIp(request.headers),
    });

    return NextResponse.json({ result: data });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[admin/system/wipe POST]', err);
    return NextResponse.json({ error: 'Failed to perform daily wipe' }, { status: 500 });
  }
}
