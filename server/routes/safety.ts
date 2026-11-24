import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { db, storagePaths, writeAuditLog } from '../db/store.ts';
import {
  clearAuthCookies,
  computePairKey,
  requireAuth,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';
import { decryptField, resolveSafeStoragePath } from '../security/crypto.ts';

export const safetyRouter = Router();

safetyRouter.get('/notifications', requireAuth, (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare(
      'SELECT id, type, title, body, link, read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
    )
    .all(req.auth!.sub) as Array<Record<string, unknown>>;

  return res.json({
    notifications: rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      link: r.link,
      read: Boolean(r.read),
      createdAt: r.created_at,
    })),
    unreadCount: rows.filter((r) => !r.read).length,
  });
});

safetyRouter.post('/notifications/read-all', requireAuth, (req: AuthenticatedRequest, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.auth!.sub);
  return res.json({ ok: true });
});

safetyRouter.post('/reports', requireAuth, (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    reportedUserId: z.string().min(3).max(80),
    category: z.enum([
      'Spam or Scam',
      'Harassment',
      'Impersonation',
      'Underage Concern',
      'Inappropriate Content',
      'Other Safety Concern',
    ]),
    description: z.string().trim().min(10).max(1200),
    disclosedExcerpt: z.string().trim().max(1500).optional(),
    consentToShareExcerpt: z.boolean().default(false),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid report details' });
  }

  const reporterId = req.auth!.sub;
  const { reportedUserId, category, description, disclosedExcerpt, consentToShareExcerpt } = parsed.data;
  if (reporterId === reportedUserId) {
    return res.status(400).json({ error: 'Cannot report your own account' });
  }

  const now = Date.now();
  const reportId = `rep_${crypto.randomUUID()}`;
  const excerptToStore = consentToShareExcerpt && disclosedExcerpt ? disclosedExcerpt : '';

  db.prepare(
    `INSERT INTO reports (id, reporter_id, reported_user_id, category, description, disclosed_excerpt, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
  ).run(reportId, reporterId, reportedUserId, category, description, excerptToStore, now, now);

  writeAuditLog(reporterId, 'SAFETY_REPORT_FILED', reportedUserId, {
    reportId,
    category,
    includedUserDisclosedExcerpt: Boolean(excerptToStore),
  });

  return res.status(201).json({
    reportId,
    message:
      'Report submitted for human safety review. Only the details and explicitly consented message excerpt you provided are visible to moderators.',
  });
});

safetyRouter.post('/block/:targetUserId', requireAuth, (req: AuthenticatedRequest, res) => {
  const blockerId = req.auth!.sub;
  const targetUserId = req.params.targetUserId;
  if (blockerId === targetUserId) return res.status(400).json({ error: 'Cannot block self' });

  const now = Date.now();
  db.prepare(
    'INSERT OR IGNORE INTO blocks (id, blocker_id, blocked_user_id, created_at) VALUES (?, ?, ?, ?)'
  ).run(`blk_${crypto.randomUUID()}`, blockerId, targetUserId, now);

  // Also unmatch any active match immediately
  const [, , pairKey] = computePairKey(blockerId, targetUserId);
  db.prepare("UPDATE matches SET status = 'unmatched' WHERE pair_key = ?").run(pairKey);
  writeAuditLog(blockerId, 'USER_BLOCKED', targetUserId);

  return res.json({ blocked: true });
});

safetyRouter.delete('/block/:targetUserId', requireAuth, (req: AuthenticatedRequest, res) => {
  db.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_user_id = ?').run(
    req.auth!.sub,
    req.params.targetUserId
  );
  writeAuditLog(req.auth!.sub, 'USER_UNBLOCKED', req.params.targetUserId);
  return res.json({ unblocked: true });
});

safetyRouter.get('/blocks', requireAuth, (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT b.blocked_user_id, b.created_at, p.display_name
       FROM blocks b LEFT JOIN profiles p ON p.user_id = b.blocked_user_id
       WHERE b.blocker_id = ? ORDER BY b.created_at DESC`
    )
    .all(req.auth!.sub) as Array<{ blocked_user_id: string; created_at: number; display_name: string }>;

  return res.json({
    blockedUsers: rows.map((r) => ({
      userId: r.blocked_user_id,
      displayName: r.display_name || 'Member',
      blockedAt: r.created_at,
    })),
  });
});

safetyRouter.get('/privacy', requireAuth, (req: AuthenticatedRequest, res) => {
  const row = db
    .prepare('SELECT * FROM consent_records WHERE user_id = ?')
    .get(req.auth!.sub) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: 'Privacy record not found' });

  return res.json({
    privacy: {
      profileVisibility: row.profile_visibility,
      photoVisibility: row.photo_visibility,
      showOnlineStatus: Boolean(row.show_online_status),
      readReceipts: Boolean(row.read_receipts),
      shareApproxLocation: Boolean(row.share_approx_location),
      aiProcessingConsent: Boolean(row.ai_processing_consent),
      discoveryPaused: Boolean(row.discovery_paused),
      notificationsEnabled: Boolean(row.notifications_enabled),
    },
  });
});

safetyRouter.put('/privacy', requireAuth, (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    profileVisibility: z.enum(['everyone', 'matches_only', 'hidden']).optional(),
    photoVisibility: z.enum(['everyone', 'matches_only', 'blind_only']).optional(),
    showOnlineStatus: z.boolean().optional(),
    readReceipts: z.boolean().optional(),
    shareApproxLocation: z.boolean().optional(),
    aiProcessingConsent: z.boolean().optional(),
    discoveryPaused: z.boolean().optional(),
    notificationsEnabled: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid privacy setting' });

  const userId = req.auth!.sub;
  const cur = db.prepare('SELECT * FROM consent_records WHERE user_id = ?').get(userId) as Record<
    string,
    unknown
  >;
  const d = parsed.data;

  db.prepare(
    `UPDATE consent_records SET
      profile_visibility = ?, photo_visibility = ?, show_online_status = ?, read_receipts = ?,
      share_approx_location = ?, ai_processing_consent = ?, discovery_paused = ?,
      notifications_enabled = ?, updated_at = ?
     WHERE user_id = ?`
  ).run(
    d.profileVisibility ?? String(cur.profile_visibility),
    d.photoVisibility ?? String(cur.photo_visibility),
    d.showOnlineStatus !== undefined ? (d.showOnlineStatus ? 1 : 0) : Number(cur.show_online_status),
    d.readReceipts !== undefined ? (d.readReceipts ? 1 : 0) : Number(cur.read_receipts),
    d.shareApproxLocation !== undefined
      ? d.shareApproxLocation
        ? 1
        : 0
      : Number(cur.share_approx_location),
    d.aiProcessingConsent !== undefined
      ? d.aiProcessingConsent
        ? 1
        : 0
      : Number(cur.ai_processing_consent),
    d.discoveryPaused !== undefined ? (d.discoveryPaused ? 1 : 0) : Number(cur.discovery_paused),
    d.notificationsEnabled !== undefined
      ? d.notificationsEnabled
        ? 1
        : 0
      : Number(cur.notifications_enabled),
    Date.now(),
    userId
  );

  writeAuditLog(userId, 'PRIVACY_SETTINGS_UPDATED', userId);
  return res.json({ message: 'Privacy preferences saved' });
});

safetyRouter.get('/export', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.auth!.sub;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Record<string, unknown>;
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  const preferences = db.prepare('SELECT * FROM preferences WHERE user_id = ?').get(userId);
  const assessment = db.prepare('SELECT * FROM personality_assessments WHERE user_id = ?').get(userId);
  const consent = db.prepare('SELECT * FROM consent_records WHERE user_id = ?').get(userId);
  const matches = db
    .prepare('SELECT id, is_blind_match, photos_revealed, compatibility_score, status, created_at FROM matches WHERE user_a = ? OR user_b = ?')
    .all(userId, userId);

  writeAuditLog(userId, 'PERSONAL_DATA_EXPORTED', userId);

  return res.json({
    exportedAt: new Date().toISOString(),
    account: {
      id: user.id,
      email: decryptField(String(user.email_encrypted)),
      name: decryptField(String(user.name_encrypted)),
      dateOfBirth: decryptField(String(user.dob_encrypted)),
      role: user.role,
      emailVerified: Boolean(user.email_verified),
      totpEnabled: Boolean(user.totp_enabled),
      createdAt: user.created_at,
    },
    profile,
    preferences,
    personalityAssessment: assessment,
    privacyConsent: consent,
    matchesMetadata: matches,
    encryptionNotice:
      'Private chat messages are end-to-end encrypted on your device using Signal Protocol and cannot be exported in plaintext by the server.',
  });
});

safetyRouter.post('/account/deactivate', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.auth!.sub;
  db.prepare("UPDATE users SET status = 'deactivated', updated_at = ? WHERE id = ?").run(
    Date.now(),
    userId
  );
  db.prepare('UPDATE user_sessions SET revoked = 1 WHERE user_id = ?').run(userId);
  writeAuditLog(userId, 'ACCOUNT_DEACTIVATED', userId);
  clearAuthCookies(req, res);
  return res.json({ message: 'Account deactivated. Sign back in anytime to reactivate.' });
});

safetyRouter.delete('/account', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.auth!.sub;

  // Clean up stored media files on disk belonging to this user
  const mediaRows = db
    .prepare('SELECT kind, file_path FROM media_assets WHERE owner_id = ?')
    .all(userId) as Array<{ kind: string; file_path: string }>;

  for (const m of mediaRows) {
    try {
      const base =
        m.kind === 'encrypted_attachment' ? storagePaths.encryptedMediaDir : storagePaths.mediaDir;
      const safe = resolveSafeStoragePath(base, path.basename(m.file_path));
      if (fs.existsSync(safe)) fs.unlinkSync(safe);
    } catch {
      // ignore missing file
    }
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  writeAuditLog('system', 'ACCOUNT_PERMANENTLY_DELETED', userId);
  clearAuthCookies(req, res);
  return res.json({ message: 'Account and associated server data permanently deleted.' });
});

safetyRouter.post('/support', (req, res) => {
  const schema = z.object({
    email: z.string().trim().email().max(160),
    topic: z.string().trim().min(3).max(80),
    message: z.string().trim().min(10).max(2000),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid support request' });
  }
  const ticketId = `sup_${crypto.randomUUID().slice(0, 8)}`;
  writeAuditLog('support_intake', 'SUPPORT_TICKET_CREATED', ticketId, { topic: parsed.data.topic });
  return res.status(201).json({
    ticketId,
    message: 'Your inquiry has been logged for our trust and support team.',
  });
});
