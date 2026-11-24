import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { db, storagePaths, writeAuditLog } from '../db/store.ts';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.ts';
import { resolveSafeStoragePath, validateMediaBuffer } from '../security/crypto.ts';
import { emitToUser, isUserOnlineIfConsented } from '../realtime/socket.ts';

export const e2eeRouter = Router();

const encryptedUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

function verifyMatchParticipant(matchId: string, userId: string) {
  const match = db
    .prepare("SELECT * FROM matches WHERE id = ? AND (user_a = ? OR user_b = ?) AND status = 'active'")
    .get(matchId, userId, userId) as
    | {
        id: string;
        user_a: string;
        user_b: string;
        is_blind_match: number;
        photos_revealed: number;
      }
    | undefined;
  if (!match) return null;

  const partnerId = match.user_a === userId ? match.user_b : match.user_a;
  const blocked = db
    .prepare(
      'SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_user_id = ?) OR (blocker_id = ? AND blocked_user_id = ?)'
    )
    .get(userId, partnerId, partnerId, userId);
  if (blocked) return null;

  return { match, partnerId };
}

const registerDeviceSchema = z.object({
  deviceId: z.number().int().min(1).max(999999),
  deviceLabel: z.string().trim().min(1).max(80).default('Browser Device'),
  registrationId: z.number().int().min(1),
  identityKeyB64: z.string().min(20).max(200),
  signedPreKey: z.object({
    keyId: z.number().int().min(0),
    publicKeyB64: z.string().min(20).max(200),
    signatureB64: z.string().min(20).max(300),
  }),
  oneTimePreKeys: z
    .array(
      z.object({
        keyId: z.number().int().min(0),
        publicKeyB64: z.string().min(20).max(200),
      })
    )
    .max(50),
});

e2eeRouter.post('/devices', requireAuth, (req: AuthenticatedRequest, res) => {
  const parsed = registerDeviceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid device key bundle' });
  }

  const userId = req.auth!.sub;
  const d = parsed.data;
  const now = Date.now();

  const existing = db
    .prepare('SELECT id, identity_key_b64 FROM device_public_keys WHERE user_id = ? AND device_id = ?')
    .get(userId, d.deviceId) as { id: string; identity_key_b64: string } | undefined;

  const keyChanged = Boolean(existing && existing.identity_key_b64 !== d.identityKeyB64);

  if (existing) {
    db.prepare(
      `UPDATE device_public_keys SET
        device_label = ?, registration_id = ?, identity_key_b64 = ?,
        signed_prekey = ?, one_time_prekeys = ?, revoked = 0, updated_at = ?
       WHERE id = ?`
    ).run(
      d.deviceLabel,
      d.registrationId,
      d.identityKeyB64,
      JSON.stringify(d.signedPreKey),
      JSON.stringify(d.oneTimePreKeys),
      now,
      existing.id
    );
  } else {
    db.prepare(
      `INSERT INTO device_public_keys (
        id, user_id, device_id, device_label, registration_id, identity_key_b64,
        signed_prekey, one_time_prekeys, revoked, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
    ).run(
      `dev_${crypto.randomUUID()}`,
      userId,
      d.deviceId,
      d.deviceLabel,
      d.registrationId,
      d.identityKeyB64,
      JSON.stringify(d.signedPreKey),
      JSON.stringify(d.oneTimePreKeys),
      now,
      now
    );
  }

  if (keyChanged) {
    // Notify active matched partners that this user's encryption identity key changed
    const matches = db
      .prepare("SELECT id, user_a, user_b FROM matches WHERE (user_a = ? OR user_b = ?) AND status = 'active'")
      .all(userId, userId) as Array<{ id: string; user_a: string; user_b: string }>;
    for (const m of matches) {
      const partnerId = m.user_a === userId ? m.user_b : m.user_a;
      db.prepare(
        `INSERT INTO notifications (id, user_id, type, title, body, link, read, created_at)
         VALUES (?, ?, 'key_change', 'Encryption Safety Number Changed', ?, ?, 0, ?)`
      ).run(
        crypto.randomUUID(),
        partnerId,
        'A match rotated their Signal identity key on a device. Verify your Safety Number before sharing sensitive details.',
        `/messages/${m.id}`,
        now
      );
      emitToUser(partnerId, 'e2ee:identity-changed', { matchId: m.id, userId, deviceId: d.deviceId });
    }
    writeAuditLog(userId, 'E2EE_IDENTITY_KEY_CHANGED', String(d.deviceId));
  }

  return res.status(201).json({
    registered: true,
    deviceId: d.deviceId,
    preKeyCount: d.oneTimePreKeys.length,
    identityChanged: keyChanged,
  });
});

e2eeRouter.get('/devices', requireAuth, (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT id, device_id, device_label, registration_id, identity_key_b64, one_time_prekeys, revoked, created_at, updated_at
       FROM device_public_keys WHERE user_id = ? ORDER BY updated_at DESC`
    )
    .all(req.auth!.sub) as Array<Record<string, unknown>>;

  return res.json({
    devices: rows.map((r) => ({
      id: r.id,
      deviceId: r.device_id,
      deviceLabel: r.device_label,
      registrationId: r.registration_id,
      identityKeyB64: r.identity_key_b64,
      remainingPreKeys: (JSON.parse(String(r.one_time_prekeys || '[]')) as unknown[]).length,
      revoked: Boolean(r.revoked),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

e2eeRouter.delete('/devices/:deviceId', requireAuth, (req: AuthenticatedRequest, res) => {
  const devId = Number(req.params.deviceId);
  const result = db
    .prepare('UPDATE device_public_keys SET revoked = 1, updated_at = ? WHERE user_id = ? AND device_id = ?')
    .run(Date.now(), req.auth!.sub, devId);
  if (result.changes === 0) return res.status(404).json({ error: 'Device not found' });
  writeAuditLog(req.auth!.sub, 'E2EE_DEVICE_REVOKED', String(devId));
  return res.json({ message: 'Device key bundle revoked' });
});

/**
 * Fetch public Signal key bundles for all active devices of a matched partner (and own other devices)
 * Atomically pops 1 one-time prekey per device for X3DH forward secrecy.
 */
e2eeRouter.get('/bundles/:targetUserId', requireAuth, (req: AuthenticatedRequest, res) => {
  const viewerId = req.auth!.sub;
  const targetUserId = req.params.targetUserId;

  if (viewerId !== targetUserId) {
    const match = db
      .prepare(
        "SELECT id FROM matches WHERE ((user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?)) AND status = 'active'"
      )
      .get(viewerId, targetUserId, targetUserId, viewerId);
    if (!match) {
      return res.status(403).json({ error: 'Public key bundles are only accessible for active mutual matches' });
    }
  }

  const devices = db
    .prepare('SELECT * FROM device_public_keys WHERE user_id = ? AND revoked = 0')
    .all(targetUserId) as Array<Record<string, unknown>>;

  const bundles = devices.map((dev) => {
    const prekeys = JSON.parse(String(dev.one_time_prekeys || '[]')) as Array<{
      keyId: number;
      publicKeyB64: string;
    }>;
    const popped = prekeys.shift() || null;
    if (popped) {
      db.prepare('UPDATE device_public_keys SET one_time_prekeys = ? WHERE id = ?').run(
        JSON.stringify(prekeys),
        String(dev.id)
      );
    }
    return {
      userId: targetUserId,
      deviceId: Number(dev.device_id),
      deviceLabel: String(dev.device_label),
      registrationId: Number(dev.registration_id),
      identityKeyB64: String(dev.identity_key_b64),
      signedPreKey: JSON.parse(String(dev.signed_prekey)),
      oneTimePreKey: popped,
    };
  });

  return res.json({ bundles, online: isUserOnlineIfConsented(targetUserId) });
});

e2eeRouter.get('/conversations/:matchId/messages', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.auth!.sub;
  const deviceId = Number(req.query.deviceId || 0);
  const access = verifyMatchParticipant(req.params.matchId, userId);
  if (!access) return res.status(403).json({ error: 'Conversation inaccessible' });

  const conv = db
    .prepare('SELECT id, disappearing_seconds FROM conversations WHERE match_id = ?')
    .get(access.match.id) as { id: string; disappearing_seconds: number } | undefined;

  if (!conv) return res.status(404).json({ error: 'Conversation not found' });

  // Purge expired disappearing messages
  const now = Date.now();
  db.prepare('DELETE FROM encrypted_messages WHERE conversation_id = ? AND expires_at > 0 AND expires_at <= ?').run(
    conv.id,
    now
  );

  // Return encrypted envelopes addressed to this user's device (or sent by this user's device)
  const rows = db
    .prepare(
      `SELECT id, sender_id, sender_device_id, recipient_id, recipient_device_id,
              signal_type, ciphertext_b64, client_msg_id, reply_to_id, expires_at,
              delivered_at, read_at, created_at
       FROM encrypted_messages
       WHERE conversation_id = ?
         AND (
           (recipient_id = ? ${deviceId > 0 ? 'AND recipient_device_id = ?' : ''})
           OR (sender_id = ? ${deviceId > 0 ? 'AND sender_device_id = ?' : ''})
         )
       ORDER BY created_at ASC LIMIT 250`
    )
    .all(
      ...(deviceId > 0
        ? [conv.id, userId, deviceId, userId, deviceId]
        : [conv.id, userId, userId])
    ) as Array<Record<string, unknown>>;

  return res.json({
    conversationId: conv.id,
    disappearingSeconds: conv.disappearing_seconds,
    partnerOnline: isUserOnlineIfConsented(access.partnerId),
    messages: rows.map((r) => ({
      id: r.id,
      senderId: r.sender_id,
      senderDeviceId: r.sender_device_id,
      recipientId: r.recipient_id,
      recipientDeviceId: r.recipient_device_id,
      signalType: r.signal_type,
      ciphertextB64: r.ciphertext_b64,
      clientMsgId: r.client_msg_id,
      replyToId: r.reply_to_id,
      expiresAt: r.expires_at,
      deliveredAt: r.delivered_at,
      readAt: r.read_at,
      createdAt: r.created_at,
    })),
  });
});

const sendEncryptedSchema = z.object({
  clientMsgId: z.string().min(8).max(80),
  senderDeviceId: z.number().int().min(1),
  replyToId: z.string().max(80).optional(),
  envelopes: z
    .array(
      z.object({
        recipientId: z.string().min(3).max(80),
        recipientDeviceId: z.number().int().min(1),
        signalType: z.number().int().min(1).max(10),
        ciphertextB64: z.string().min(8).max(160000),
      })
    )
    .min(1)
    .max(20),
});

e2eeRouter.post('/conversations/:matchId/messages', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.auth!.sub;
  const access = verifyMatchParticipant(req.params.matchId, userId);
  if (!access) return res.status(403).json({ error: 'Active mutual match required to message' });

  const parsed = sendEncryptedSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid encrypted message payload' });
  }

  const conv = db
    .prepare('SELECT id, disappearing_seconds FROM conversations WHERE match_id = ?')
    .get(access.match.id) as { id: string; disappearing_seconds: number } | undefined;
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });

  const now = Date.now();
  const expiresAt = conv.disappearing_seconds > 0 ? now + conv.disappearing_seconds * 1000 : 0;
  const { clientMsgId, senderDeviceId, replyToId, envelopes } = parsed.data;

  // Enforce recipients can ONLY be participants in this match
  for (const envItem of envelopes) {
    if (envItem.recipientId !== userId && envItem.recipientId !== access.partnerId) {
      return res.status(403).json({ error: 'Invalid envelope recipient outside match' });
    }
  }

  const insertStmt = db.prepare(
    `INSERT OR IGNORE INTO encrypted_messages (
      id, conversation_id, sender_id, sender_device_id, recipient_id, recipient_device_id,
      signal_type, ciphertext_b64, client_msg_id, reply_to_id, expires_at, delivered_at, read_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
  );

  const insertedIds: string[] = [];
  for (const envItem of envelopes) {
    const msgId = `msg_${crypto.randomUUID()}`;
    const info = insertStmt.run(
      msgId,
      conv.id,
      userId,
      senderDeviceId,
      envItem.recipientId,
      envItem.recipientDeviceId,
      envItem.signalType,
      envItem.ciphertextB64,
      clientMsgId,
      replyToId || '',
      expiresAt,
      now,
      now
    );
    if (info.changes > 0) {
      insertedIds.push(msgId);
      emitToUser(envItem.recipientId, 'e2ee:message', {
        id: msgId,
        matchId: access.match.id,
        conversationId: conv.id,
        senderId: userId,
        senderDeviceId,
        recipientId: envItem.recipientId,
        recipientDeviceId: envItem.recipientDeviceId,
        signalType: envItem.signalType,
        ciphertextB64: envItem.ciphertextB64,
        clientMsgId,
        replyToId: replyToId || '',
        expiresAt,
        deliveredAt: now,
        readAt: 0,
        createdAt: now,
      });
    }
  }

  db.prepare('UPDATE conversations SET last_message_at = ? WHERE id = ?').run(now, conv.id);

  // Privacy-preserving notification: NEVER include message content or preview
  db.prepare(
    `INSERT INTO notifications (id, user_id, type, title, body, link, read, created_at)
     VALUES (?, ?, 'message', 'New Encrypted Message', 'You received an end-to-end encrypted message.', ?, 0, ?)`
  ).run(crypto.randomUUID(), access.partnerId, `/messages/${access.match.id}`, now);

  return res.status(201).json({
    stored: true,
    clientMsgId,
    createdAt: now,
    expiresAt,
    count: insertedIds.length,
  });
});

e2eeRouter.patch('/conversations/:matchId/disappearing', requireAuth, (req: AuthenticatedRequest, res) => {
  const schema = z.object({ seconds: z.number().int().min(0).max(604800) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid timer duration' });

  const access = verifyMatchParticipant(req.params.matchId, req.auth!.sub);
  if (!access) return res.status(403).json({ error: 'Forbidden' });

  db.prepare('UPDATE conversations SET disappearing_seconds = ? WHERE match_id = ?').run(
    parsed.data.seconds,
    access.match.id
  );
  emitToUser(access.partnerId, 'conversation:disappearing-updated', {
    matchId: access.match.id,
    seconds: parsed.data.seconds,
  });

  return res.json({ disappearingSeconds: parsed.data.seconds });
});

e2eeRouter.delete('/conversations/:matchId', requireAuth, (req: AuthenticatedRequest, res) => {
  const access = verifyMatchParticipant(req.params.matchId, req.auth!.sub);
  if (!access) return res.status(403).json({ error: 'Forbidden' });

  const conv = db
    .prepare('SELECT id FROM conversations WHERE match_id = ?')
    .get(access.match.id) as { id: string } | undefined;
  if (conv) {
    db.prepare('DELETE FROM encrypted_messages WHERE conversation_id = ?').run(conv.id);
  }
  writeAuditLog(req.auth!.sub, 'CONVERSATION_CLEARED', access.match.id);
  return res.json({ message: 'Encrypted conversation history deleted from server.' });
});

e2eeRouter.post(
  '/attachments/:matchId',
  requireAuth,
  encryptedUpload.single('ciphertext'),
  (req: AuthenticatedRequest, res) => {
    const access = verifyMatchParticipant(req.params.matchId, req.auth!.sub);
    if (!access) return res.status(403).json({ error: 'Forbidden' });
    if (!req.file) return res.status(400).json({ error: 'Encrypted attachment blob required' });

    try {
      validateMediaBuffer(req.file.buffer, 'encrypted');
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }

    const mediaId = `eatt_${crypto.randomUUID()}`;
    const filename = `${mediaId}.enc`;
    const diskPath = resolveSafeStoragePath(storagePaths.encryptedMediaDir, filename);
    fs.writeFileSync(diskPath, req.file.buffer);

    db.prepare(
      `INSERT INTO media_assets (id, owner_id, kind, mime_type, file_path, size_bytes, created_at)
       VALUES (?, ?, 'encrypted_attachment', 'application/octet-stream', ?, ?, ?)`
    ).run(mediaId, req.auth!.sub, filename, req.file.buffer.length, Date.now());

    return res.status(201).json({
      attachmentId: mediaId,
      url: `/api/e2ee/attachments/${access.match.id}/${mediaId}`,
    });
  }
);

e2eeRouter.get('/attachments/:matchId/:mediaId', requireAuth, (req: AuthenticatedRequest, res) => {
  const access = verifyMatchParticipant(req.params.matchId, req.auth!.sub);
  if (!access) return res.status(403).json({ error: 'Forbidden' });

  const asset = db
    .prepare("SELECT file_path FROM media_assets WHERE id = ? AND kind = 'encrypted_attachment'")
    .get(req.params.mediaId) as { file_path: string } | undefined;
  if (!asset) return res.status(404).json({ error: 'Encrypted attachment not found' });

  const diskPath = resolveSafeStoragePath(
    storagePaths.encryptedMediaDir,
    path.basename(asset.file_path)
  );
  if (!fs.existsSync(diskPath)) return res.status(404).json({ error: 'Attachment file missing' });

  res.setHeader('Content-Type', 'application/octet-stream');
  return res.sendFile(diskPath);
});
