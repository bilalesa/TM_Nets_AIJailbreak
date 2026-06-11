// backend/src/controllers/adminController.ts

import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { pool } from '../config/supabase.js';
import type { AdminClaims, AdminRole } from '../middlewares/adminAuthMiddleware.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

function getAdminJwtSecret(): string {
  const secret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('Missing ADMIN_JWT_SECRET / JWT_SECRET');
  return secret;
}

function extractClientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) {
    const first = Array.isArray(fwd) ? fwd[0] : fwd.split(',')[0];
    return first?.trim() || null;
  }
  return req.ip ?? null;
}

async function writeAudit(
  adminId: string,
  entry: {
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    details?: Record<string, unknown> | null;
    ipAddress?: string | null;
  },
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        adminId,
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

function requireRole(admin: AdminClaims, allowed: AdminRole[]): boolean {
  return allowed.includes(admin.role);
}

const ADMIN_TOKEN_TTL_SECONDS = 60 * 60 * 8; // 8h

// ─── controllers ──────────────────────────────────────────────────────────────

/** POST /api/admin/login */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body as { email?: unknown; password?: unknown };

    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
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
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const ok = await bcrypt.compare(password, admin.password_hash as string);
    if (!ok) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const claims: AdminClaims = {
      id: admin.id as string,
      email: admin.email as string,
      role: admin.role as AdminRole,
      name: (admin.name as string | null) ?? null,
    };

    const token = jwt.sign(claims, getAdminJwtSecret(), {
      expiresIn: ADMIN_TOKEN_TTL_SECONDS,
    });

    // Update last_login_at (non-fatal)
    pool.query('UPDATE admin_users SET last_login_at = $1 WHERE id = $2', [
      new Date().toISOString(),
      admin.id,
    ]).catch((err) => console.error('[login] last_login_at update failed', err));

    await writeAudit(claims.id, {
      action: 'admin_login',
      targetType: 'admin_user',
      targetId: admin.id as string,
      ipAddress: extractClientIp(req),
    });

    res.json({
      success: true,
      token,
      admin: { id: claims.id, email: claims.email, name: claims.name, role: claims.role },
    });
  } catch (err) {
    console.error('[adminController.login]', err);
    res.status(500).json({ error: 'Login failed' });
  }
};

/** GET /api/admin/players */
export const getPlayers = async (req: Request, res: Response): Promise<void> => {
  try {
    const search = String(req.query.search ?? '').trim();
    const limit = Math.min(Number(req.query.limit ?? '25'), 100);
    const offset = Math.max(Number(req.query.offset ?? '0'), 0);
    const filter = String(req.query.filter ?? 'all');

    const conditions: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    if (search) {
      conditions.push(`username ILIKE $${p++}`);
      values.push(`%${search}%`);
    }
    if (filter === 'banned') {
      conditions.push(`is_banned = $${p++}`);
      values.push(true);
    }
    if (filter === 'active') {
      conditions.push(`is_banned = $${p++}`);
      values.push(false);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM players ${where}`,
      values,
    );
    const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

    const dataValues = [...values, limit, offset];
    const dataResult = await pool.query(
      `SELECT id, username, total_score, is_banned, banned_reason, created_at, registration_ip, client_fingerprint
       FROM players
       ${where}
       ORDER BY created_at DESC
       LIMIT $${p++} OFFSET $${p++}`,
      dataValues,
    );

    res.json({ players: dataResult.rows, total, limit, offset });
  } catch (err) {
    console.error('[adminController.getPlayers]', err);
    res.status(500).json({ error: 'Failed to load players' });
  }
};

/** GET /api/admin/players/:id */
export const getPlayer = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const [playerRes, completionsRes, promptsRes] = await Promise.all([
      pool.query(
        `SELECT id, username, total_score, is_banned, banned_reason, created_at,
                registration_ip, client_fingerprint, session_active
         FROM players
         WHERE id = $1
         LIMIT 1`,
        [id],
      ),
      pool.query(
        `SELECT stage_number, score_awarded, time_taken_seconds, started_at, submitted_at,
                completed_at, client_fingerprint
         FROM stage_completions
         WHERE player_id = $1
         ORDER BY stage_number ASC`,
        [id],
      ),
      pool.query(
        `SELECT id, stage_number, prompt_text, ai_response, is_successful, is_blocked_by_anticheat, created_at
         FROM prompt_logs
         WHERE player_id = $1
         ORDER BY created_at DESC
         LIMIT 100`,
        [id],
      ),
    ]);

    const player = playerRes.rows[0] ?? null;
    if (!player) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    res.json({ player, completions: completionsRes.rows, promptLogs: promptsRes.rows });
  } catch (err) {
    console.error('[adminController.getPlayer]', err);
    res.status(500).json({ error: 'Failed to load player' });
  }
};

/** DELETE /api/admin/players/:id */
export const deletePlayer = async (req: Request, res: Response): Promise<void> => {
  const admin = req.admin!;
  if (!requireRole(admin, ['super_admin'])) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  try {
    const id = String(req.params.id);
    await pool.query('DELETE FROM players WHERE id = $1', [id]);

    await writeAudit(admin.id, {
      action: 'delete_player',
      targetType: 'player',
      targetId: id,
      ipAddress: extractClientIp(req),
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[adminController.deletePlayer]', err);
    res.status(500).json({ error: 'Failed to delete player' });
  }
};

/** POST /api/admin/players/:id/ban */
export const banPlayer = async (req: Request, res: Response): Promise<void> => {
  const admin = req.admin!;
  try {
    const id = String(req.params.id);
    const { reason } = (req.body ?? {}) as { reason?: unknown };
    const banReason =
      typeof reason === 'string' && reason.trim() ? reason.trim() : 'No reason provided';

    const result = await pool.query(
      `UPDATE players SET is_banned = true, banned_reason = $1
       WHERE id = $2
       RETURNING id, username`,
      [banReason, id],
    );

    const data = result.rows[0] ?? null;
    if (!data) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    await writeAudit(admin.id, {
      action: 'ban_player',
      targetType: 'player',
      targetId: id,
      details: { reason: banReason, username: data.username },
      ipAddress: extractClientIp(req),
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[adminController.banPlayer]', err);
    res.status(500).json({ error: 'Failed to ban player' });
  }
};

/** POST /api/admin/players/:id/unban */
export const unbanPlayer = async (req: Request, res: Response): Promise<void> => {
  const admin = req.admin!;
  try {
    const id = String(req.params.id);

    const result = await pool.query(
      `UPDATE players SET is_banned = false, banned_reason = NULL
       WHERE id = $1
       RETURNING id, username`,
      [id],
    );

    const data = result.rows[0] ?? null;
    if (!data) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    await writeAudit(admin.id, {
      action: 'unban_player',
      targetType: 'player',
      targetId: id,
      details: { username: data.username },
      ipAddress: extractClientIp(req),
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[adminController.unbanPlayer]', err);
    res.status(500).json({ error: 'Failed to unban player' });
  }
};

/** GET /api/admin/leaderboard */
export const getLeaderboard = async (_req: Request, res: Response): Promise<void> => {
  try {
    function formatTime(seconds: number): string {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
    }

    const playersRes = await pool.query(
      `SELECT id, username, total_score, is_banned, created_at
       FROM players
       ORDER BY total_score DESC`,
    );

    const players = playersRes.rows;

    if (!players || players.length === 0) {
      res.json({ leaderboard: [], totalPlayers: 0 });
      return;
    }

    const playerIds = players.map((p) => p.id);
    const completionsRes = await pool.query(
      `SELECT player_id, stage_number, time_taken_seconds
       FROM stage_completions
       WHERE player_id = ANY($1)`,
      [playerIds],
    );

    const completionMap = new Map<string, { stagesPassed: number; totalSeconds: number }>();
    for (const c of completionsRes.rows) {
      const existing = completionMap.get(c.player_id) ?? { stagesPassed: 0, totalSeconds: 0 };
      completionMap.set(c.player_id, {
        stagesPassed: existing.stagesPassed + 1,
        totalSeconds: existing.totalSeconds + Number(c.time_taken_seconds),
      });
    }

    const ranked = players
      .map((p) => {
        const agg = completionMap.get(p.id) ?? { stagesPassed: 0, totalSeconds: 0 };
        return {
          id: p.id,
          username: p.username,
          totalScore: Number(p.total_score),
          isBanned: p.is_banned,
          createdAt: p.created_at,
          stagesPassed: agg.stagesPassed,
          totalSeconds: agg.totalSeconds,
          totalTimeFormatted: formatTime(agg.totalSeconds),
        };
      })
      .sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        return a.totalSeconds - b.totalSeconds;
      })
      .map((p, i) => ({ ...p, rank: i + 1 }));

    res.json({ leaderboard: ranked, totalPlayers: ranked.length });
  } catch (err) {
    console.error('[adminController.getLeaderboard]', err);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
};

/** GET /api/admin/stats */
export const getStats = async (_req: Request, res: Response): Promise<void> => {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [
      playersTotalRes,
      playersBannedRes,
      playersRecentRes,
      completionsTotalRes,
      promptsTotalRes,
      stageBreakdownRes,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) AS count FROM players'),
      pool.query('SELECT COUNT(*) AS count FROM players WHERE is_banned = true'),
      pool.query('SELECT COUNT(*) AS count FROM players WHERE created_at >= $1', [since24h]),
      pool.query('SELECT COUNT(*) AS count FROM stage_completions'),
      pool.query('SELECT COUNT(*) AS count FROM prompt_logs WHERE created_at >= $1', [since24h]),
      pool.query('SELECT stage_number FROM stage_completions'),
    ]);

    const counts: Record<number, number> = {};
    for (const row of stageBreakdownRes.rows) {
      const n = Number(row.stage_number);
      counts[n] = (counts[n] ?? 0) + 1;
    }

    res.json({
      players: {
        total: parseInt(playersTotalRes.rows[0]?.count ?? '0', 10),
        banned: parseInt(playersBannedRes.rows[0]?.count ?? '0', 10),
        joinedLast24h: parseInt(playersRecentRes.rows[0]?.count ?? '0', 10),
      },
      completions: {
        total: parseInt(completionsTotalRes.rows[0]?.count ?? '0', 10),
        byStage: counts,
      },
      activity: {
        promptsLast24h: parseInt(promptsTotalRes.rows[0]?.count ?? '0', 10),
      },
    });
  } catch (err) {
    console.error('[adminController.getStats]', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
};

/** GET /api/admin/audit */
export const getAudit = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(Number(req.query.limit ?? '25'), 200);
    const offset = Math.max(Number(req.query.offset ?? '0'), 0);
    const action = req.query.action ? String(req.query.action) : null;
    const adminId = req.query.adminId ? String(req.query.adminId) : null;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    if (action) {
      conditions.push(`a.action = $${p++}`);
      values.push(action);
    }
    if (adminId) {
      conditions.push(`a.admin_id = $${p++}`);
      values.push(adminId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM admin_audit_log a ${where}`,
      values,
    );
    const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

    const dataValues = [...values, limit, offset];
    const dataResult = await pool.query(
      `SELECT a.id, a.admin_id, a.action, a.target_type, a.target_id, a.details, a.ip_address, a.created_at,
              json_build_object('email', au.email, 'name', au.name) AS admin_users
       FROM admin_audit_log a
       LEFT JOIN admin_users au ON a.admin_id = au.id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $${p++} OFFSET $${p++}`,
      dataValues,
    );

    res.json({ entries: dataResult.rows, total, limit, offset });
  } catch (err) {
    console.error('[adminController.getAudit]', err);
    res.status(500).json({ error: 'Failed to load audit log' });
  }
};

/** POST /api/admin/system/wipe */
export const wipeSystem = async (req: Request, res: Response): Promise<void> => {
  const admin = req.admin!;
  if (!requireRole(admin, ['super_admin'])) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM cracked_prompts');
    await client.query('DELETE FROM prompt_logs');
    await client.query('DELETE FROM stage_completions');
    await client.query('DELETE FROM players');
    await client.query('COMMIT');

    const data = { wiped: true };

    await writeAudit(admin.id, {
      action: 'daily_wipe',
      targetType: 'system',
      targetId: null,
      details: data,
      ipAddress: extractClientIp(req),
    });

    res.json({ result: data });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    console.error('[adminController.wipeSystem]', err);
    res.status(500).json({ error: 'Failed to perform wipe' });
  } finally {
    client.release();
  }
};

/** GET /api/admin/stages */
export const getStages = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT id, stage_number, name, subtitle, base_xp, secret_code, system_prompt,
              opening_message, is_active, updated_at, updated_by
       FROM stage_configs
       ORDER BY stage_number ASC`,
    );
    res.json({ stages: result.rows });
  } catch (err) {
    console.error('[adminController.getStages]', err);
    res.status(500).json({ error: 'Failed to load stages' });
  }
};

/** GET /api/admin/stages/:number */
export const getStage = async (req: Request, res: Response): Promise<void> => {
  try {
    const stageNumber = Number(req.params.number);
    if (!Number.isInteger(stageNumber)) {
      res.status(400).json({ error: 'Invalid stage number' });
      return;
    }

    const result = await pool.query(
      'SELECT * FROM stage_configs WHERE stage_number = $1 LIMIT 1',
      [stageNumber],
    );

    const data = result.rows[0] ?? null;
    if (!data) {
      res.status(404).json({ error: 'Stage not found' });
      return;
    }

    res.json({ stage: data });
  } catch (err) {
    console.error('[adminController.getStage]', err);
    res.status(500).json({ error: 'Failed to load stage' });
  }
};

const ALLOWED_STAGE_FIELDS = [
  'name',
  'subtitle',
  'base_xp',
  'secret_code',
  'system_prompt',
  'opening_message',
  'is_active',
] as const;

/** PATCH /api/admin/stages/:number */
export const updateStage = async (req: Request, res: Response): Promise<void> => {
  const admin = req.admin!;
  if (!requireRole(admin, ['admin', 'super_admin'])) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  try {
    const stageNumber = Number(req.params.number);
    if (!Number.isInteger(stageNumber)) {
      res.status(400).json({ error: 'Invalid stage number' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const updateFields: Record<string, unknown> = {};
    for (const key of ALLOWED_STAGE_FIELDS) {
      if (key in body) updateFields[key] = body[key];
    }
    if (Object.keys(updateFields).length === 0) {
      res.status(400).json({ error: 'No allowed fields provided' });
      return;
    }
    updateFields.updated_by = admin.id;
    updateFields.updated_at = new Date().toISOString();

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let p = 1;
    for (const [col, val] of Object.entries(updateFields)) {
      setClauses.push(`${col} = $${p++}`);
      values.push(val);
    }
    values.push(stageNumber);

    const result = await pool.query(
      `UPDATE stage_configs
       SET ${setClauses.join(', ')}
       WHERE stage_number = $${p}
       RETURNING *`,
      values,
    );

    const data = result.rows[0] ?? null;
    if (!data) {
      res.status(404).json({ error: 'Stage not found' });
      return;
    }

    await writeAudit(admin.id, {
      action: 'update_stage',
      targetType: 'stage',
      targetId: String(stageNumber),
      details: { fields: Object.keys(updateFields) },
      ipAddress: extractClientIp(req),
    });

    res.json({ stage: data });
  } catch (err) {
    console.error('[adminController.updateStage]', err);
    res.status(500).json({ error: 'Failed to update stage' });
  }
};
