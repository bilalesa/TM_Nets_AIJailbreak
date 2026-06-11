import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import {
  extractClientIp,
  setAdminCookie,
  signAdminToken,
  verifyPassword,
  writeAudit,
  type AdminRole,
} from '@/lib/adminAuth';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = (await request.json()) as {
      email?: unknown;
      password?: unknown;
    };

    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const result = await pool.query(
      `SELECT id, email, password_hash, name, role, is_active
       FROM admin_users
       WHERE email = $1
       LIMIT 1`,
      [email.trim().toLowerCase()],
    );

    const admin = result.rows[0] ?? null;

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

    await pool.query(
      'UPDATE admin_users SET last_login_at = $1 WHERE id = $2',
      [new Date().toISOString(), admin.id],
    );

    await writeAudit(claims, {
      action: 'admin_login',
      targetType: 'admin_user',
      targetId: admin.id as string,
      ipAddress: extractClientIp(request.headers),
    });

    return NextResponse.json({
      success: true,
      admin: { id: claims.id, email: claims.email, name: claims.name, role: claims.role },
    });
  } catch (err) {
    console.error('[admin/login]', err);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
