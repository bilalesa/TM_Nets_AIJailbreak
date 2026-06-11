// backend/src/middlewares/adminAuthMiddleware.ts

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/supabase.js';

export type AdminRole = 'admin' | 'super_admin' | 'moderator';

export interface AdminClaims {
  id: string;
  email: string;
  role: AdminRole;
  name: string | null;
}

function getAdminJwtSecret(): string {
  const secret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('Missing ADMIN_JWT_SECRET / JWT_SECRET');
  return secret;
}

function getTokenFromCookieHeader(cookieHeader?: string): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';');
  for (const cookieEntry of cookies) {
    const [rawName, ...rawValueParts] = cookieEntry.trim().split('=');
    if (rawName === 'admin_session_token') {
      const rawValue = rawValueParts.join('=');
      return rawValue ? decodeURIComponent(rawValue) : null;
    }
  }
  return null;
}

export const adminAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  let secret: string;
  try {
    secret = getAdminJwtSecret();
  } catch {
    res.status(500).json({ error: 'Server auth misconfigured: admin JWT secret is missing' });
    return;
  }

  const authHeader = req.headers.authorization;
  const bearerToken =
    authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  const cookieToken = getTokenFromCookieHeader(req.headers.cookie);
  const token = bearerToken || cookieToken;

  if (!token) {
    res.status(401).json({ error: 'Unauthorized: No token provided' });
    return;
  }

  let decoded: AdminClaims;
  try {
    decoded = jwt.verify(token, secret) as AdminClaims;
  } catch {
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
    return;
  }

  // Verify admin is still active in the database
  try {
    const result = await pool.query(
      'SELECT id, is_active FROM admin_users WHERE id = $1 LIMIT 1',
      [decoded.id],
    );
    const row = result.rows[0] ?? null;
    if (!row || !row.is_active) {
      res.status(401).json({ error: 'Unauthorized: Admin account disabled or not found' });
      return;
    }
  } catch (err) {
    console.error('[adminAuthMiddleware] DB check failed', err);
    res.status(500).json({ error: 'Failed to validate admin session' });
    return;
  }

  req.admin = decoded;
  next();
};
