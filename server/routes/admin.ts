import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.ts';
import { db, getAppConfig, setAppConfig, writeAuditLog } from '../db/store.ts';
import {
  requireAdmin,
  requireAuth,
  setAuthCookies,
  signAccessToken,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';
import { authRateLimiter } from '../middleware/rateLimit.ts';
import {
  createTotpSecret,
  decryptField,
  encryptField,
  generateQrDataUrl,
  hashPassword,
  verifyPassword,
  verifyTotpCode,
} from '../security/crypto.ts';

export const adminRouter = Router();

/**
 * Checks whether an admin account or configured ADMIN_PASSCODE exists.
 * Never exposes secrets; enables first-run interactive Admin Claim in preview.
 */
adminRouter.get('/bootstrap-status', (_req, res) => {
  const adminRow = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  return res.json({
    hasAdminUser: Boolean(adminRow),
    envPasscodeConfigured: Boolean(env.adminPasscode),
  });
});

/**
 * Promotes the authenticated user to Admin via configured ADMIN_PASSCODE
 * OR via one-time interactive Admin Claim if no admin exists yet and ADMIN_PASSCODE is unset,
 * immediately requiring TOTP 2FA setup.
 */
adminRouter.post('/claim', requireAuth, authRateLimiter, async (req: AuthenticatedRequest, res) => {
  const schema = z.object({ passcode: z.string().min(8).max(128) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Passcode (8+ characters) required' });
  }

  const userId = req.auth!.sub;
  const existingAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get() as
    | { id: string }
    | undefined;
  const claimedHash = getAppConfig('admin_claimed_hash', '');

  if (env.adminPasscode) {
    // Constant-time comparison against configured server secret
    const a = crypto.createHash('sha256').update(parsed.data.passcode).digest();
    const b = crypto.createHash('sha256').update(env.adminPasscode).digest();
    if (!crypto.timingSafeEqual(a, b)) {
      writeAuditLog(userId, 'ADMIN_CLAIM_DENIED', userId);
      return res.status(403).json({ error: 'Invalid administrator passcode' });
    }
  } else if (existingAdmin || claimedHash) {
    if (!claimedHash || !(await verifyPassword(claimedHash, parsed.data.passcode))) {
      writeAuditLog(userId, 'ADMIN_CLAIM_DENIED', userId);
      return res.status(403).json({ error: 'Administrator already claimed. Provide the claimed admin passcode.' });
    }
  } else {
    // First-run atomic claim: store Argon2id hash of chosen admin passcode
    const hash = await hashPassword(parsed.data.passcode);
    setAppConfig('admin_claimed_hash', hash);
  }

  const user = db
    .prepare('SELECT email_encrypted, totp_enabled, totp_secret_encrypted, email_verified FROM users WHERE id = ?')
    .get(userId) as {
    email_encrypted: string;
    totp_enabled: number;
    totp_secret_encrypted: string;
    email_verified: number;
  };

  db.prepare("UPDATE users SET role = 'admin', updated_at = ? WHERE id = ?").run(Date.now(), userId);
  writeAuditLog(userId, 'ADMIN_ROLE_GRANTED', userId);

  let totpSetup: { secret: string; qrDataUrl: string } | null = null;
  if (!user.totp_enabled) {
    const email = decryptField(user.email_encrypted);
    const { base32, otpauthUri } = createTotpSecret(`Admin · ${email}`);
    const qrDataUrl = await generateQrDataUrl(otpauthUri);
    db.prepare('UPDATE users SET totp_secret_encrypted = ? WHERE id = ?').run(
      encryptField(base32),
      userId
    );
    totpSetup = { secret: base32, qrDataUrl };
  }

  const newAccess = signAccessToken({
    sub: userId,
    role: 'admin',
    sessionId: req.auth!.sessionId,
    mfaVerified: Boolean(user.totp_enabled && req.auth!.mfaVerified),
    emailVerified: Boolean(user.email_verified),
  });
  const refreshCookie = req.cookies?.bondai_refresh || '';
  if (refreshCookie) {
    setAuthCookies(req, res, newAccess, String(refreshCookie));
  }

  return res.json({
    role: 'admin',
    mfaVerified: Boolean(user.totp_enabled && req.auth!.mfaVerified),
    requiresMfaVerification: !user.totp_enabled || !req.auth!.mfaVerified,
    totpSetup,
    accessToken: newAccess,
  });
});

adminRouter.post('/verify-mfa', requireAuth, (req: AuthenticatedRequest, res) => {
  const schema = z.object({ code: z.string().min(6).max(8) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '6-digit TOTP code required' });

  const user = db
    .prepare('SELECT role, totp_secret_encrypted, email_verified FROM users WHERE id = ?')
    .get(req.auth!.sub) as
    | { role: 'user' | 'moderator' | 'admin'; totp_secret_encrypted: string; email_verified: number }
    | undefined;

  if (!user || (user.role !== 'admin' && user.role !== 'moderator')) {
    return res.status(403).json({ error: 'Admin role required' });
  }
  if (!user.totp_secret_encrypted || !verifyTotpCode(decryptField(user.totp_secret_encrypted), parsed.data.code)) {
    return res.status(401).json({ error: 'Invalid authenticator code' });
  }

  db.prepare('UPDATE users SET totp_enabled = 1, updated_at = ? WHERE id = ?').run(
    Date.now(),
    req.auth!.sub
  );
  const newAccess = signAccessToken({
    sub: req.auth!.sub,
    role: user.role,
    sessionId: req.auth!.sessionId,
    mfaVerified: true,
    emailVerified: Boolean(user.email_verified),
  });
  const refreshCookie = req.cookies?.bondai_refresh || '';
  if (refreshCookie) {
    setAuthCookies(req, res, newAccess, String(refreshCookie));
  }
  writeAuditLog(req.auth!.sub, 'ADMIN_MFA_VERIFIED', req.auth!.sub);

  return res.json({ mfaVerified: true, accessToken: newAccess });
});

adminRouter.get('/overview', requireAuth, requireAdmin, (_req, res) => {
  const totalUsers = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  const activeUsers = (
    db.prepare("SELECT COUNT(*) as c FROM users WHERE status = 'active'").get() as { c: number }
  ).c;
  const suspendedUsers = (
    db.prepare("SELECT COUNT(*) as c FROM users WHERE status = 'suspended'").get() as { c: number }
  ).c;
  const totalMatches = (
    db.prepare("SELECT COUNT(*) as c FROM matches WHERE status = 'active'").get() as { c: number }
  ).c;
  const blindMatches = (
    db
      .prepare("SELECT COUNT(*) as c FROM matches WHERE status = 'active' AND is_blind_match = 1")
      .get() as { c: number }
  ).c;
  const pendingReports = (
    db.prepare("SELECT COUNT(*) as c FROM reports WHERE status = 'pending'").get() as { c: number }
  ).c;
  const failedLogins24h = (
    db
      .prepare("SELECT COUNT(*) as c FROM audit_logs WHERE action = 'LOGIN_FAILED' AND created_at >= ?")
      .get(Date.now() - 86400000) as { c: number }
  ).c;

  return res.json({
    stats: {
      totalUsers,
      activeUsers,
      suspendedUsers,
      totalMatches,
      blindMatches,
      pendingReports,
      failedLogins24h,
      dailySwipeLimit: Number(getAppConfig('daily_swipe_limit', String(env.dailySwipeLimit))),
      uptimeSeconds: Math.floor(process.uptime()),
      e2eeBoundary:
        'Administrators cannot access or decrypt private conversations. Only explicitly submitted safety report excerpts appear in moderation.',
    },
  });
});

adminRouter.get('/reports', requireAuth, requireAdmin, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT r.*, rp.display_name as reporter_name, tp.display_name as reported_name, tu.status as target_status
       FROM reports r
       LEFT JOIN profiles rp ON rp.user_id = r.reporter_id
       LEFT JOIN profiles tp ON tp.user_id = r.reported_user_id
       LEFT JOIN users tu ON tu.id = r.reported_user_id
       ORDER BY r.created_at DESC LIMIT 100`
    )
    .all() as Array<Record<string, unknown>>;

  return res.json({
    reports: rows.map((r) => ({
      id: r.id,
      reporterId: r.reporter_id,
      reporterName: r.reporter_name || 'Member',
      reportedUserId: r.reported_user_id,
      reportedName: r.reported_name || 'Member',
      targetStatus: r.target_status,
      category: r.category,
      description: r.description,
      disclosedExcerpt: r.disclosed_excerpt,
      status: r.status,
      moderatorNotes: r.moderator_notes,
      createdAt: r.created_at,
    })),
  });
});

adminRouter.patch('/reports/:reportId', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    status: z.enum(['pending', 'reviewing', 'resolved', 'dismissed']),
    moderatorNotes: z.string().trim().max(500).default(''),
    suspendTarget: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid moderation update' });

  const report = db.prepare('SELECT reported_user_id FROM reports WHERE id = ?').get(req.params.reportId) as
    | { reported_user_id: string }
    | undefined;
  if (!report) return res.status(404).json({ error: 'Report not found' });

  const now = Date.now();
  db.prepare('UPDATE reports SET status = ?, moderator_notes = ?, updated_at = ? WHERE id = ?').run(
    parsed.data.status,
    parsed.data.moderatorNotes,
    now,
    req.params.reportId
  );

  if (parsed.data.suspendTarget) {
    db.prepare("UPDATE users SET status = 'suspended', updated_at = ? WHERE id = ?").run(
      now,
      report.reported_user_id
    );
    db.prepare('UPDATE user_sessions SET revoked = 1 WHERE user_id = ?').run(report.reported_user_id);
    writeAuditLog(req.auth!.sub, 'ADMIN_USER_SUSPENDED', report.reported_user_id, {
      reportId: req.params.reportId,
    });
  }

  writeAuditLog(req.auth!.sub, 'ADMIN_REPORT_UPDATED', req.params.reportId, {
    status: parsed.data.status,
  });
  return res.json({ updated: true });
});

adminRouter.post('/users/:userId/unsuspend', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
  db.prepare("UPDATE users SET status = 'active', updated_at = ? WHERE id = ?").run(
    Date.now(),
    req.params.userId
  );
  writeAuditLog(req.auth!.sub, 'ADMIN_USER_UNSUSPENDED', req.params.userId);
  return res.json({ unsuspended: true });
});

adminRouter.put('/config/limits', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
  const schema = z.object({ dailySwipeLimit: z.number().int().min(5).max(500) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid limit value' });
  setAppConfig('daily_swipe_limit', String(parsed.data.dailySwipeLimit));
  writeAuditLog(req.auth!.sub, 'ADMIN_LIMIT_UPDATED', 'daily_swipe_limit', parsed.data);
  return res.json({ dailySwipeLimit: parsed.data.dailySwipeLimit });
});

adminRouter.get('/audit-logs', requireAuth, requireAdmin, (_req, res) => {
  const logs = db
    .prepare('SELECT id, actor_id, action, target_id, metadata_json, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 100')
    .all() as Array<Record<string, unknown>>;
  return res.json({
    logs: logs.map((l) => ({
      id: l.id,
      actorId: l.actor_id,
      action: l.action,
      targetId: l.target_id,
      metadata: JSON.parse(String(l.metadata_json || '{}')),
      createdAt: l.created_at,
    })),
  });
});
