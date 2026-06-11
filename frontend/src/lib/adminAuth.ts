// frontend/src/lib/adminAuth.ts
// Admin authentication: bcrypt password verification, JWT issuance, session management via httpOnly cookies, and role-based access control.

import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { pool } from './db';

export const ADMIN_COOKIE_NAME = 'admin_session_token';
const ADMIN_TOKEN_TTL_SECONDS = 60 * 60 * 8; // 8h

export type AdminRole = 'admin' | 'super_admin' | 'moderator';

export interface AdminClaims {
  id: string;
  email: string;
  role: AdminRole;
  name: string | null;
}

function getJwtSecret(): string {
  const secret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('Missing ADMIN_JWT_SECRET / JWT_SECRET');
  return secret;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signAdminToken(claims: AdminClaims): string {
  return jwt.sign(claims, getJwtSecret(), { expiresIn: ADMIN_TOKEN_TTL_SECONDS });
}

export async function setAdminCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set({
    name: ADMIN_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: ADMIN_TOKEN_TTL_SECONDS,
    path: '/',
  });
}

export async function clearAdminCookie(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE_NAME);
}

export async function getAdminFromCookie(): Promise<AdminClaims | null> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AdminClaims & {
      iat: number;
      exp: number;
    };
    return {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      name: decoded.name ?? null,
    };
  } catch {
    return null;
  }
}

export async function requireAdmin(): Promise<AdminClaims> {
  const admin = await getAdminFromCookie();
  if (!admin) {
    throw new AdminAuthError('Unauthorized', 401);
  }
  // Re-validate against DB to catch deactivated/banned admins on every request.
  const result = await pool.query(
    'SELECT id, is_active FROM admin_users WHERE id = $1 LIMIT 1',
    [admin.id],
  );
  const row = result.rows[0];
  if (!row || !row.is_active) {
    throw new AdminAuthError('Admin disabled or not found', 401);
  }
  return admin;
}

export function requireRole(admin: AdminClaims, allowed: AdminRole[]): void {
  if (!allowed.includes(admin.role)) {
    throw new AdminAuthError('Forbidden', 403);
  }
}

export class AdminAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface AuditEntry {
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

export async function writeAudit(
  admin: AdminClaims,
  entry: AuditEntry,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        admin.id,
        entry.action,
        entry.targetType ?? null,
        entry.targetId ?? null,
        entry.details ? JSON.stringify(entry.details) : null,
        entry.ipAddress ?? null,
      ],
    );
  } catch (err) {
    console.error('[admin_audit_log insert]', err);
  }
}

export function extractClientIp(headers: Headers): string | null {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() || null;
  return headers.get('x-real-ip');
}
