// frontend/src/app/api/admin/system/wipe/route.ts
//
// POST /api/admin/system/wipe
//   super_admin only.
//
// Manually triggers the same `public.daily_wipe()` Postgres function that
// the Phase 3b cron job will call. Wraps it with admin auth, audit
// logging, and a 200 response carrying the wipe summary so the admin UI
// (Phase 3b) can show "X players cleared, Y prompts cleared" feedback.

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
