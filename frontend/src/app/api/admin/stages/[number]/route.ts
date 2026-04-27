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

interface RouteContext {
  params: Promise<{ number: string }>;
}

const ALLOWED_FIELDS = [
  'name',
  'subtitle',
  'base_xp',
  'secret_code',
  'system_prompt',
  'opening_message',
  'is_active',
] as const;

type AllowedField = (typeof ALLOWED_FIELDS)[number];

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await requireAdmin();
    const { number } = await context.params;
    const stageNumber = Number(number);
    if (!Number.isInteger(stageNumber)) {
      return NextResponse.json({ error: 'Invalid stage number' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('stage_configs')
      .select('*')
      .eq('stage_number', stageNumber)
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
    return NextResponse.json({ stage: data });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[admin/stages/:number GET]', err);
    return NextResponse.json({ error: 'Failed to load stage' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ['admin', 'super_admin']);
    const { number } = await context.params;
    const stageNumber = Number(number);
    if (!Number.isInteger(stageNumber)) {
      return NextResponse.json({ error: 'Invalid stage number' }, { status: 400 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in body) update[key] = body[key as AllowedField];
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No allowed fields provided' }, { status: 400 });
    }
    update.updated_by = admin.id;
    update.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('stage_configs')
      .update(update)
      .eq('stage_number', stageNumber)
      .select('*')
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Stage not found' }, { status: 404 });

    await writeAudit(admin, {
      action: 'update_stage',
      targetType: 'stage',
      targetId: String(stageNumber),
      details: { fields: Object.keys(update) },
      ipAddress: extractClientIp(request.headers),
    });

    return NextResponse.json({ stage: data });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[admin/stages/:number PATCH]', err);
    return NextResponse.json({ error: 'Failed to update stage' }, { status: 500 });
  }
}
