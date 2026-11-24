import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.ts';
import { db, getAppConfig, writeAuditLog } from '../db/store.ts';
import { computePairKey, requireAuth, type AuthenticatedRequest } from '../middleware/auth.ts';
import {
  areMutuallyCompatiblePreferences,
  computeExplainableCompatibility,
  type CandidateProfileRecord,
} from '../services/matching.ts';
import { emitToUser } from '../realtime/socket.ts';

export const discoveryRouter = Router();

export function loadCandidateRecord(userId: string): CandidateProfileRecord | null {
  const row = db
    .prepare(
      `SELECT u.id as user_id, u.age_years, u.is_dev_demo,
              p.*, pref.min_age, pref.max_age, pref.preferred_genders, pref.relationship_goals, pref.weights,
              pa.answers
       FROM users u
       JOIN profiles p ON p.user_id = u.id
       JOIN preferences pref ON pref.user_id = u.id
       LEFT JOIN personality_assessments pa ON pa.user_id = u.id
       WHERE u.id = ? AND u.status = 'active'`
    )
    .get(userId) as Record<string, unknown> | undefined;

  if (!row) return null;
  return {
    userId: String(row.user_id),
    ageYears: Number(row.age_years),
    displayName: String(row.display_name),
    gender: String(row.gender),
    datingPreferences: JSON.parse(String(row.dating_preferences || '[]')),
    cityRegion: String(row.city_region || ''),
    occupation: String(row.occupation || ''),
    education: String(row.education || ''),
    languages: JSON.parse(String(row.languages || '[]')),
    bio: String(row.bio || ''),
    interests: JSON.parse(String(row.interests || '[]')),
    favoriteMusic: String(row.favorite_music || ''),
    favoriteMovies: String(row.favorite_movies || ''),
    favoriteActivities: String(row.favorite_activities || ''),
    prompts: JSON.parse(String(row.prompts || '[]')),
    photos: JSON.parse(String(row.photos || '[]')),
    voiceIntroUrl: String(row.voice_intro_url || ''),
    relationshipGoal: String(row.relationship_goal || 'Long-term relationship'),
    lifestyle: JSON.parse(String(row.lifestyle || '{}')),
    verifiedBadge: Boolean(row.verified_badge),
    blindConnectEnabled: Boolean(row.blind_connect_enabled),
    isDevDemo: Boolean(row.is_dev_demo),
    minAgePref: Number(row.min_age || 18),
    maxAgePref: Number(row.max_age || 99),
    preferredGenders: JSON.parse(String(row.preferred_genders || '["Everyone"]')),
    relationshipGoalsPref: JSON.parse(String(row.relationship_goals || '[]')),
    answers: JSON.parse(String(row.answers || '{}')),
    weights: JSON.parse(
      String(row.weights || '{"values":25,"personality":25,"interests":20,"goals":20,"lifestyle":10}')
    ),
  };
}

function getDailySwipeStats(userId: string) {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const row = db
    .prepare('SELECT COUNT(*) as cnt FROM swipes WHERE actor_id = ? AND created_at >= ?')
    .get(userId, startOfDay.getTime()) as { cnt: number };
  const limit = Number(getAppConfig('daily_swipe_limit', String(env.dailySwipeLimit)));
  return { used: row.cnt, limit, remaining: Math.max(0, limit - row.cnt) };
}

discoveryRouter.get('/', requireAuth, (req: AuthenticatedRequest, res) => {
  const viewerId = req.auth!.sub;
  const mode = req.query.mode === 'blind' ? 'blind' : 'standard';
  const minScoreFilter = Number(req.query.minScore || 0);
  const goalFilter = typeof req.query.goal === 'string' ? req.query.goal.trim().toLowerCase() : '';
  const limit = Math.min(30, Math.max(1, Number(req.query.limit || 20)));
  const offset = Math.max(0, Number(req.query.offset || 0));

  const viewer = loadCandidateRecord(viewerId);
  if (!viewer) return res.status(404).json({ error: 'Profile not found' });

  const viewerConsent = db
    .prepare('SELECT discovery_paused FROM consent_records WHERE user_id = ?')
    .get(viewerId) as { discovery_paused: number } | undefined;

  if (viewerConsent?.discovery_paused === 1) {
    return res.json({
      paused: true,
      candidates: [],
      dailyStats: getDailySwipeStats(viewerId),
    });
  }

  const candidateRows = db
    .prepare(
      `SELECT u.id, c.profile_visibility, c.photo_visibility, c.share_approx_location
       FROM users u
       JOIN profiles p ON p.user_id = u.id
       JOIN consent_records c ON c.user_id = u.id
       WHERE u.id != ?
         AND u.status = 'active'
         AND u.email_verified = 1
         AND c.discovery_paused = 0
         AND c.profile_visibility = 'everyone'
         AND u.id NOT IN (SELECT target_id FROM swipes WHERE actor_id = ?)
         AND u.id NOT IN (SELECT blocked_user_id FROM blocks WHERE blocker_id = ?)
         AND u.id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_user_id = ?)
         ${mode === 'blind' ? 'AND p.blind_connect_enabled = 1' : ''}`
    )
    .all(viewerId, viewerId, viewerId, viewerId) as Array<{
    id: string;
    profile_visibility: string;
    photo_visibility: string;
    share_approx_location: number;
  }>;

  const ranked = [];
  for (const row of candidateRows) {
    const cand = loadCandidateRecord(row.id);
    if (!cand) continue;
    if (!areMutuallyCompatiblePreferences(viewer, cand)) continue;
    if (goalFilter && !cand.relationshipGoal.toLowerCase().includes(goalFilter)) continue;

    const compat = computeExplainableCompatibility(viewer, cand);
    if (compat.overallScore < minScoreFilter) continue;

    const hidePhotos =
      mode === 'blind' ||
      row.photo_visibility === 'blind_only' ||
      row.photo_visibility === 'matches_only';

    ranked.push({
      userId: cand.userId,
      displayName: hidePhotos ? cand.displayName.split(' ')[0] : cand.displayName,
      age: cand.ageYears,
      gender: cand.gender,
      cityRegion: row.share_approx_location ? cand.cityRegion : 'Approximate location hidden',
      occupation: hidePhotos ? '' : cand.occupation,
      bio: cand.bio,
      interests: cand.interests,
      prompts: cand.prompts,
      photos: hidePhotos ? [] : cand.photos,
      photosHidden: hidePhotos,
      relationshipGoal: cand.relationshipGoal,
      lifestyle: cand.lifestyle,
      verifiedBadge: cand.verifiedBadge,
      blindConnectEnabled: cand.blindConnectEnabled,
      isDevDemo: cand.isDevDemo,
      compatibility: compat,
    });
  }

  ranked.sort((a, b) => b.compatibility.overallScore - a.compatibility.overallScore);
  const page = ranked.slice(offset, offset + limit);

  return res.json({
    paused: false,
    mode,
    totalAvailable: ranked.length,
    candidates: page,
    dailyStats: getDailySwipeStats(viewerId),
  });
});

discoveryRouter.post('/swipe', requireAuth, (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    targetId: z.string().min(3).max(80),
    action: z.enum(['like', 'pass', 'superlike']),
    mode: z.enum(['standard', 'blind']).default('standard'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid swipe request' });
  }

  const actorId = req.auth!.sub;
  const { targetId, action, mode } = parsed.data;
  if (actorId === targetId) {
    return res.status(400).json({ error: 'Cannot swipe on yourself' });
  }

  const stats = getDailySwipeStats(actorId);
  if (stats.remaining <= 0) {
    return res.status(429).json({
      error: `Daily discovery limit (${stats.limit}) reached. Return tomorrow for fresh recommendations.`,
    });
  }

  const blocked = db
    .prepare(
      'SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_user_id = ?) OR (blocker_id = ? AND blocked_user_id = ?)'
    )
    .get(actorId, targetId, targetId, actorId);
  if (blocked) return res.status(403).json({ error: 'User is blocked' });

  const now = Date.now();
  const swipeId = `swp_${crypto.randomUUID()}`;

  try {
    db.prepare(
      `INSERT INTO swipes (id, actor_id, target_id, action, mode, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(actor_id, target_id) DO UPDATE SET action = excluded.action, mode = excluded.mode, created_at = excluded.created_at`
    ).run(swipeId, actorId, targetId, action, mode, now);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }

  let matched = false;
  let matchRecord: { id: string; isBlindMatch: boolean; compatibilityScore: number } | null = null;

  if (action === 'like' || action === 'superlike') {
    const reciprocal = db
      .prepare(
        `SELECT action, mode FROM swipes WHERE actor_id = ? AND target_id = ? AND action IN ('like', 'superlike')`
      )
      .get(targetId, actorId) as { action: string; mode: string } | undefined;

    if (reciprocal) {
      const [userA, userB, pairKey] = computePairKey(actorId, targetId);
      const isBlind = mode === 'blind' || reciprocal.mode === 'blind';

      const actorRec = loadCandidateRecord(actorId);
      const targetRec = loadCandidateRecord(targetId);
      const score =
        actorRec && targetRec ? computeExplainableCompatibility(actorRec, targetRec).overallScore : 75;

      const existingMatch = db
        .prepare('SELECT id, is_blind_match, compatibility_score FROM matches WHERE pair_key = ?')
        .get(pairKey) as
        | { id: string; is_blind_match: number; compatibility_score: number }
        | undefined;

      if (!existingMatch) {
        const matchId = `mtc_${crypto.randomUUID()}`;
        const convId = `cnv_${crypto.randomUUID()}`;

        const tx = db.prepare('BEGIN');
        tx.run();
        try {
          db.prepare(
            `INSERT INTO matches (id, user_a, user_b, pair_key, is_blind_match, photos_revealed, compatibility_score, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`
          ).run(matchId, userA, userB, pairKey, isBlind ? 1 : 0, isBlind ? 0 : 1, score, now);

          db.prepare(
            `INSERT INTO conversations (id, match_id, user_a, user_b, disappearing_seconds, last_message_at, created_at)
             VALUES (?, ?, ?, ?, 0, 0, ?)`
          ).run(convId, matchId, userA, userB, now);

          if (isBlind) {
            db.prepare(
              `INSERT INTO photo_reveal_requests (id, match_id, user_a, user_b, user_a_approved, user_b_approved, declined_by, updated_at)
               VALUES (?, ?, ?, ?, 0, 0, '', ?)`
            ).run(`rev_${crypto.randomUUID()}`, matchId, userA, userB, now);
          }

          db.prepare(
            `INSERT INTO notifications (id, user_id, type, title, body, link, read, created_at)
             VALUES (?, ?, 'match', ?, ?, ?, 0, ?)`
          ).run(
            crypto.randomUUID(),
            targetId,
            isBlind ? 'New Blind Connect Match' : 'New Mutual Match',
            `You matched with ${actorRec?.displayName.split(' ')[0] || 'someone new'} (${score}% alignment).`,
            isBlind ? '/blind-connect' : '/matches',
            now
          );

          db.prepare('COMMIT').run();
        } catch (err) {
          db.prepare('ROLLBACK').run();
          throw err;
        }

        matched = true;
        matchRecord = { id: matchId, isBlindMatch: isBlind, compatibilityScore: score };
        emitToUser(targetId, 'match:created', { matchId, isBlindMatch: isBlind, compatibilityScore: score });
      } else {
        matched = true;
        matchRecord = {
          id: existingMatch.id,
          isBlindMatch: Boolean(existingMatch.is_blind_match),
          compatibilityScore: existingMatch.compatibility_score,
        };
      }
    } else if (action === 'superlike') {
      const actorProf = db
        .prepare('SELECT display_name FROM profiles WHERE user_id = ?')
        .get(actorId) as { display_name: string } | undefined;
      db.prepare(
        `INSERT INTO notifications (id, user_id, type, title, body, link, read, created_at)
         VALUES (?, ?, 'superlike', 'Someone Super Liked you', ?, '/discover', 0, ?)`
      ).run(
        crypto.randomUUID(),
        targetId,
        `${actorProf?.display_name.split(' ')[0] || 'A member'} sent a Super Like.`,
        now
      );
    }
  }

  return res.json({
    recorded: true,
    matched,
    match: matchRecord,
    dailyStats: getDailySwipeStats(actorId),
  });
});

discoveryRouter.post('/undo', requireAuth, (req: AuthenticatedRequest, res) => {
  const actorId = req.auth!.sub;
  const lastSwipe = db
    .prepare('SELECT id, target_id FROM swipes WHERE actor_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(actorId) as { id: string; target_id: string } | undefined;

  if (!lastSwipe) {
    return res.status(404).json({ error: 'No recent swipe to undo' });
  }

  const [, , pairKey] = computePairKey(actorId, lastSwipe.target_id);
  const existingMatch = db
    .prepare("SELECT id FROM matches WHERE pair_key = ? AND status = 'active'")
    .get(pairKey);
  if (existingMatch) {
    return res.status(400).json({ error: 'Cannot undo a swipe that already formed an active match' });
  }

  db.prepare('DELETE FROM swipes WHERE id = ?').run(lastSwipe.id);
  return res.json({ undoneTargetId: lastSwipe.target_id });
});

discoveryRouter.get('/matches', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.auth!.sub;
  const rows = db
    .prepare(
      `SELECT m.*, c.id as conversation_id, c.last_message_at, c.disappearing_seconds,
              pr.user_a_approved, pr.user_b_approved, pr.declined_by
       FROM matches m
       LEFT JOIN conversations c ON c.match_id = m.id
       LEFT JOIN photo_reveal_requests pr ON pr.match_id = m.id
       WHERE (m.user_a = ? OR m.user_b = ?) AND m.status = 'active'
       ORDER BY COALESCE(c.last_message_at, m.created_at) DESC`
    )
    .all(userId, userId) as Array<Record<string, unknown>>;

  const matches = rows
    .map((r) => {
      const partnerId = r.user_a === userId ? String(r.user_b) : String(r.user_a);
      const partner = loadCandidateRecord(partnerId);
      if (!partner) return null;

      const isBlind = Boolean(r.is_blind_match);
      const photosRevealed = Boolean(r.photos_revealed);
      const hidePhotos = isBlind && !photosRevealed;
      const isUserA = r.user_a === userId;
      const myRevealApproved = isUserA ? Boolean(r.user_a_approved) : Boolean(r.user_b_approved);
      const partnerRevealApproved = isUserA ? Boolean(r.user_b_approved) : Boolean(r.user_a_approved);

      const consent = db
        .prepare('SELECT show_online_status FROM consent_records WHERE user_id = ?')
        .get(partnerId) as { show_online_status: number } | undefined;

      return {
        matchId: String(r.id),
        conversationId: String(r.conversation_id || ''),
        partnerId,
        displayName: hidePhotos ? partner.displayName.split(' ')[0] : partner.displayName,
        age: partner.ageYears,
        cityRegion: partner.cityRegion,
        occupation: hidePhotos ? 'Hidden until photo reveal' : partner.occupation,
        bio: partner.bio,
        interests: partner.interests,
        relationshipGoal: partner.relationshipGoal,
        photos: hidePhotos ? [] : partner.photos,
        photosHidden: hidePhotos,
        isBlindMatch: isBlind,
        photosRevealed,
        myRevealApproved,
        partnerRevealApproved,
        revealDeclinedBy: String(r.declined_by || ''),
        compatibilityScore: Number(r.compatibility_score || 0),
        disappearingSeconds: Number(r.disappearing_seconds || 0),
        lastMessageAt: Number(r.last_message_at || 0),
        showOnlineStatus: Boolean(consent?.show_online_status),
        isDevDemo: partner.isDevDemo,
        createdAt: Number(r.created_at),
      };
    })
    .filter(Boolean);

  return res.json({ matches });
});

discoveryRouter.delete('/matches/:matchId', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.auth!.sub;
  const match = db
    .prepare('SELECT id, user_a, user_b FROM matches WHERE id = ?')
    .get(req.params.matchId) as { id: string; user_a: string; user_b: string } | undefined;

  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (match.user_a !== userId && match.user_b !== userId) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  db.prepare("UPDATE matches SET status = 'unmatched' WHERE id = ?").run(match.id);
  writeAuditLog(userId, 'MATCH_UNMATCHED', match.id);
  return res.json({ message: 'Unmatched successfully' });
});
