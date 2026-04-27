import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseClient';
import {
  extractClientIp,
  setAdminCookie,
  signAdminToken,
  verifyPassword,
  writeAudit,
  type AdminRole,
} from '@/lib/adminAuth';

const supabase = getSupabaseServerClient();

export async function POST(request: NextRequest) {
  try {
    const { email, password } = (await request.json()) as {
      email?: unknown;
      password?: unknown;
    };

    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const { data: admin, error } = await supabase
      .from('admin_users')
      .select('id, email, password_hash, name, role, is_active')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();

    if (error) {
      console.error('[admin/login] supabase', error);
      return NextResponse.json({ error: 'Login failed' }, { status: 500 });
    }

    if (!admin || !admin.is_active) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const ok = await verifyPassword(password, admin.password_hash);
    if (!ok) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const claims = {
      id: admin.id as string,
      email: admin.email as string,
      role: admin.role as AdminRole,
      name: (admin.name as string | null) ?? null,
    };
    const token = signAdminToken(claims);
    await setAdminCookie(token);

    await supabase.from('admin_users').update({ last_login_at: new Date().toISOString() }).eq('id', admin.id);

    await writeAudit(
      claims,
      {
        action: 'admin_login',
        targetType: 'admin_user',
        targetId: admin.id as string,
        ipAddress: extractClientIp(request.headers),
      },
      supabase,
    );

    return NextResponse.json({
      success: true,
      admin: { id: claims.id, email: claims.email, name: claims.name, role: claims.role },
    });
  } catch (err) {
    console.error('[admin/login]', err);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
