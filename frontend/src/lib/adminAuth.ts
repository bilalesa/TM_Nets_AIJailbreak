// frontend/src/lib/adminAuth.ts
// Admin session management via httpOnly cookies.
// requireAdmin() verifies the JWT locally — DB re-validation is handled by the backend middleware.

import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

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

/**
 * Verifies the admin cookie JWT locally.
 * DB re-validation (is_active check) is delegated to the backend adminAuthMiddleware
 * on each proxied request, so no DB call is needed here.
 */
export async function requireAdmin(): Promise<AdminClaims> {
  const admin = await getAdminFromCookie();
  if (!admin) {
    throw new AdminAuthError('Unauthorized', 401);
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

export function extractClientIp(headers: Headers): string | null {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() || null;
  return headers.get('x-real-ip');
}
