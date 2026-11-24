import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db, writeAuditLog } from '../db/store.ts';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.ts';
import { emitToUser } from '../realtime/socket.ts';

export const blindConnectRouter = Router();

blindConnectRouter.post('/:matchId/reveal', requireAuth, (req: AuthenticatedRequest, res) => {
  const schema = z.object({ action: z.enum(['approve', 'decline']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid reveal decision' });

  const userId = req.auth!.sub;
  const match = db
    .prepare("SELECT * FROM matches WHERE id = ? AND (user_a = ? OR user_b = ?) AND status = 'active'")
    .get(req.params.matchId, userId, userId) as
    | { id: string; user_a: string; user_b: string; is_blind_match: number; photos_revealed: number }
    | undefined;

  if (!match) return res.status(404).json({ error: 'Active match not found' });

  let reqRow = db
    .prepare('SELECT * FROM photo_reveal_requests WHERE match_id = ?')
    .get(match.id) as
    | {
        id: string;
        match_id: string;
        user_a: string;
        user_b: string;
        user_a_approved: number;
        user_b_approved: number;
        declined_by: string;
      }
    | undefined;

  const now = Date.now();
  if (!reqRow) {
    const id = `rev_${crypto.randomUUID()}`;
    db.prepare(
      `INSERT INTO photo_reveal_requests (id, match_id, user_a, user_b, user_a_approved, user_b_approved, declined_by, updated_at)
       VALUES (?, ?, ?, ?, 0, 0, '', ?)`
    ).run(id, match.id, match.user_a, match.user_b, now);
    reqRow = {
      id,
      match_id: match.id,
      user_a: match.user_a,
      user_b: match.user_b,
      user_a_approved: 0,
      user_b_approved: 0,
      declined_by: '',
    };
  }

  const isUserA = match.user_a === userId;
  const partnerId = isUserA ? match.user_b : match.user_a;

  if (parsed.data.action === 'decline') {
    db.prepare(
      'UPDATE photo_reveal_requests SET user_a_approved = 0, user_b_approved = 0, declined_by = ?, updated_at = ? WHERE match_id = ?'
    ).run(userId, now, match.id);
    db.prepare('UPDATE matches SET photos_revealed = 0 WHERE id = ?').run(match.id);
    writeAuditLog(userId, 'BLIND_PHOTO_REVEAL_DECLINED', match.id);
    emitToUser(partnerId, 'blind:reveal-updated', { matchId: match.id, photosRevealed: false, declined: true });
    return res.json({ photosRevealed: false, myApproved: false, partnerApproved: false, declined: true });
  }

  const nextA = isUserA ? 1 : reqRow.user_a_approved;
  const nextB = !isUserA ? 1 : reqRow.user_b_approved;
  const bothApproved = nextA === 1 && nextB === 1;

  db.prepare(
    'UPDATE photo_reveal_requests SET user_a_approved = ?, user_b_approved = ?, declined_by = ?, updated_at = ? WHERE match_id = ?'
  ).run(nextA, nextB, '', now, match.id);

  if (bothApproved) {
    db.prepare('UPDATE matches SET photos_revealed = 1 WHERE id = ?').run(match.id);
    db.prepare(
      `INSERT INTO notifications (id, user_id, type, title, body, link, read, created_at)
       VALUES (?, ?, 'photo_reveal', 'Photos Mutually Revealed', 'You and your Blind Connect match both consented to reveal photos.', ?, 0, ?)`
    ).run(crypto.randomUUID(), partnerId, `/profile/${userId}`, now);
    writeAuditLog(userId, 'BLIND_PHOTO_REVEAL_COMPLETED', match.id);
  } else {
    db.prepare(
      `INSERT INTO notifications (id, user_id, type, title, body, link, read, created_at)
       VALUES (?, ?, 'photo_reveal_request', 'Photo Reveal Request', 'Your Blind Connect match consented to reveal photos. Respond only if you feel ready.', '/blind-connect', 0, ?)`
    ).run(crypto.randomUUID(), partnerId, now);
  }

  emitToUser(partnerId, 'blind:reveal-updated', {
    matchId: match.id,
    photosRevealed: bothApproved,
    partnerApproved: true,
  });

  return res.json({
    photosRevealed: bothApproved,
    myApproved: true,
    partnerApproved: isUserA ? nextB === 1 : nextA === 1,
    declined: false,
  });
});
