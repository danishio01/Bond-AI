import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { db, storagePaths, writeAuditLog } from '../db/store.ts';
import { computePairKey, requireAuth, type AuthenticatedRequest } from '../middleware/auth.ts';
import { resolveSafeStoragePath, validateMediaBuffer } from '../security/crypto.ts';
import { PERSONALITY_QUESTIONS } from '../../shared/questionnaire.ts';

export const profilesRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
});

function isBlockedBetween(userA: string, userB: string): boolean {
  const row = db
    .prepare(
      'SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_user_id = ?) OR (blocker_id = ? AND blocked_user_id = ?)'
    )
    .get(userA, userB, userB, userA);
  return Boolean(row);
}

const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(50).optional(),
  gender: z.string().trim().min(1).max(40).optional(),
  datingPreferences: z.array(z.string().trim().max(40)).max(10).optional(),
  cityRegion: z.string().trim().max(80).optional(),
  occupation: z.string().trim().max(80).optional(),
  education: z.string().trim().max(100).optional(),
  languages: z.array(z.string().trim().max(40)).max(12).optional(),
  bio: z.string().trim().max(600).optional(),
  interests: z.array(z.string().trim().max(40)).max(16).optional(),
  favoriteMusic: z.string().trim().max(200).optional(),
  favoriteMovies: z.string().trim().max(200).optional(),
  favoriteActivities: z.string().trim().max(250).optional(),
  prompts: z
    .array(z.object({ question: z.string().trim().max(120), answer: z.string().trim().max(300) }))
    .max(5)
    .optional(),
  relationshipGoal: z.string().trim().max(60).optional(),
  lifestyle: z.record(z.string(), z.string().trim().max(40)).optional(),
  blindConnectEnabled: z.boolean().optional(),
  onboardingStep: z.number().int().min(1).max(7).optional(),
  photoOrderIds: z.array(z.string()).max(6).optional(),
});

profilesRouter.put('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid profile fields' });
  }

  const userId = req.auth!.sub;
  const existing = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId) as
    | Record<string, unknown>
    | undefined;
  if (!existing) return res.status(404).json({ error: 'Profile not found' });

  const d = parsed.data;
  let photos = JSON.parse(String(existing.photos || '[]')) as Array<{
    id: string;
    url: string;
    order: number;
  }>;
  if (d.photoOrderIds) {
    const map = new Map(photos.map((p) => [p.id, p]));
    const reordered = d.photoOrderIds
      .map((id, idx) => {
        const item = map.get(id);
        return item ? { ...item, order: idx } : null;
      })
      .filter(Boolean) as Array<{ id: string; url: string; order: number }>;
    if (reordered.length > 0) photos = reordered;
  }

  db.prepare(
    `UPDATE profiles SET
      display_name = ?, gender = ?, dating_preferences = ?, city_region = ?,
      occupation = ?, education = ?, languages = ?, bio = ?, interests = ?,
      favorite_music = ?, favorite_movies = ?, favorite_activities = ?, prompts = ?,
      photos = ?, relationship_goal = ?, lifestyle = ?, blind_connect_enabled = ?,
      onboarding_step = ?, updated_at = ?
     WHERE user_id = ?`
  ).run(
    d.displayName ?? String(existing.display_name),
    d.gender ?? String(existing.gender),
    d.datingPreferences ? JSON.stringify(d.datingPreferences) : String(existing.dating_preferences),
    d.cityRegion ?? String(existing.city_region),
    d.occupation ?? String(existing.occupation),
    d.education ?? String(existing.education),
    d.languages ? JSON.stringify(d.languages) : String(existing.languages),
    d.bio ?? String(existing.bio),
    d.interests ? JSON.stringify(d.interests) : String(existing.interests),
    d.favoriteMusic ?? String(existing.favorite_music),
    d.favoriteMovies ?? String(existing.favorite_movies),
    d.favoriteActivities ?? String(existing.favorite_activities),
    d.prompts ? JSON.stringify(d.prompts) : String(existing.prompts),
    JSON.stringify(photos),
    d.relationshipGoal ?? String(existing.relationship_goal),
    d.lifestyle ? JSON.stringify(d.lifestyle) : String(existing.lifestyle),
    d.blindConnectEnabled !== undefined
      ? d.blindConnectEnabled
        ? 1
        : 0
      : Number(existing.blind_connect_enabled),
    d.onboardingStep ?? Number(existing.onboarding_step),
    Date.now(),
    userId
  );

  return res.json({ message: 'Profile updated' });
});

profilesRouter.put('/preferences', requireAuth, (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    minAge: z.number().int().min(18).max(99).optional(),
    maxAge: z.number().int().min(18).max(100).optional(),
    maxDistanceKm: z.number().int().min(5).max(5000).optional(),
    preferredGenders: z.array(z.string().trim().max(40)).min(1).max(6).optional(),
    relationshipGoals: z.array(z.string().trim().max(60)).max(6).optional(),
    lifestyleFilters: z.record(z.string(), z.string().max(40)).optional(),
    weights: z
      .object({
        values: z.number().min(0).max(100),
        personality: z.number().min(0).max(100),
        interests: z.number().min(0).max(100),
        goals: z.number().min(0).max(100),
        lifestyle: z.number().min(0).max(100),
      })
      .optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid preferences' });
  }

  const userId = req.auth!.sub;
  const existing = db.prepare('SELECT * FROM preferences WHERE user_id = ?').get(userId) as Record<
    string,
    unknown
  >;
  const d = parsed.data;
  const minAge = d.minAge ?? Number(existing.min_age);
  const maxAge = Math.max(minAge, d.maxAge ?? Number(existing.max_age));

  db.prepare(
    `UPDATE preferences SET min_age = ?, max_age = ?, max_distance_km = ?, preferred_genders = ?,
     relationship_goals = ?, lifestyle_filters = ?, weights = ?, updated_at = ? WHERE user_id = ?`
  ).run(
    minAge,
    maxAge,
    d.maxDistanceKm ?? Number(existing.max_distance_km),
    d.preferredGenders ? JSON.stringify(d.preferredGenders) : String(existing.preferred_genders),
    d.relationshipGoals ? JSON.stringify(d.relationshipGoals) : String(existing.relationship_goals),
    d.lifestyleFilters ? JSON.stringify(d.lifestyleFilters) : String(existing.lifestyle_filters),
    d.weights ? JSON.stringify(d.weights) : String(existing.weights),
    Date.now(),
    userId
  );

  return res.json({ message: 'Match preferences updated' });
});

profilesRouter.put('/assessment', requireAuth, (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    answers: z.record(z.string(), z.number().int().min(1).max(4)),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid questionnaire answers' });
  }

  const cleanAnswers: Record<string, number> = {};
  const valuesVec: number[] = [];
  const personalityVec: number[] = [];
  let completedCount = 0;

  for (const q of PERSONALITY_QUESTIONS) {
    const val = parsed.data.answers[q.id];
    if (typeof val === 'number' && val >= 1 && val <= 4) {
      cleanAnswers[q.id] = val;
      completedCount++;
      if (q.category === 'values' || q.category === 'expectations' || q.category === 'future') {
        valuesVec.push(val);
      } else {
        personalityVec.push(val);
      }
    }
  }

  db.prepare(
    `INSERT INTO personality_assessments (user_id, answers, values_vector, personality_vector, completed_count, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       answers = excluded.answers,
       values_vector = excluded.values_vector,
       personality_vector = excluded.personality_vector,
       completed_count = excluded.completed_count,
       updated_at = excluded.updated_at`
  ).run(
    req.auth!.sub,
    JSON.stringify(cleanAnswers),
    JSON.stringify(valuesVec),
    JSON.stringify(personalityVec),
    completedCount,
    Date.now()
  );

  return res.json({ message: 'Personality assessment saved', completedCount });
});

profilesRouter.post(
  '/media/photo',
  requireAuth,
  upload.single('photo'),
  (req: AuthenticatedRequest, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    const userId = req.auth!.sub;
    const profile = db.prepare('SELECT photos FROM profiles WHERE user_id = ?').get(userId) as
      | { photos: string }
      | undefined;
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const existingPhotos = JSON.parse(profile.photos || '[]') as Array<{
      id: string;
      url: string;
      order: number;
    }>;
    if (existingPhotos.length >= 6) {
      return res.status(400).json({ error: 'Maximum of 6 profile photos allowed' });
    }

    let validated;
    try {
      validated = validateMediaBuffer(req.file.buffer, 'image');
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }

    const mediaId = `med_${crypto.randomUUID()}`;
    const filename = `${mediaId}.${validated.extension}`;
    const diskPath = resolveSafeStoragePath(storagePaths.mediaDir, filename);
    fs.writeFileSync(diskPath, req.file.buffer);

    const url = `/api/profiles/media/${mediaId}`;
    db.prepare(
      `INSERT INTO media_assets (id, owner_id, kind, mime_type, file_path, size_bytes, created_at)
       VALUES (?, ?, 'profile_photo', ?, ?, ?, ?)`
    ).run(mediaId, userId, validated.mimeType, filename, req.file.buffer.length, Date.now());

    const updatedPhotos = [...existingPhotos, { id: mediaId, url, order: existingPhotos.length }];
    db.prepare('UPDATE profiles SET photos = ?, updated_at = ? WHERE user_id = ?').run(
      JSON.stringify(updatedPhotos),
      Date.now(),
      userId
    );
    writeAuditLog(userId, 'PHOTO_UPLOADED', mediaId);

    return res.status(201).json({ photo: { id: mediaId, url, order: existingPhotos.length }, photos: updatedPhotos });
  }
);

profilesRouter.delete('/media/:mediaId', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.auth!.sub;
  const mediaId = req.params.mediaId;
  const asset = db
    .prepare('SELECT id, owner_id, kind, file_path FROM media_assets WHERE id = ?')
    .get(mediaId) as { id: string; owner_id: string; kind: string; file_path: string } | undefined;

  if (!asset) return res.status(404).json({ error: 'Media not found' });
  if (asset.owner_id !== userId) {
    return res.status(403).json({ error: 'You do not have permission to delete this media' });
  }

  try {
    const fullPath = resolveSafeStoragePath(storagePaths.mediaDir, path.basename(asset.file_path));
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  } catch {
    // ignore missing file
  }
  db.prepare('DELETE FROM media_assets WHERE id = ?').run(mediaId);

  if (asset.kind === 'profile_photo') {
    const profile = db.prepare('SELECT photos FROM profiles WHERE user_id = ?').get(userId) as
      | { photos: string }
      | undefined;
    if (profile) {
      const photos = (JSON.parse(profile.photos || '[]') as Array<{ id: string; url: string; order: number }>)
        .filter((p) => p.id !== mediaId)
        .map((p, idx) => ({ ...p, order: idx }));
      db.prepare('UPDATE profiles SET photos = ?, updated_at = ? WHERE user_id = ?').run(
        JSON.stringify(photos),
        Date.now(),
        userId
      );
    }
  } else if (asset.kind === 'voice_intro') {
    db.prepare('UPDATE profiles SET voice_intro_url = ?, updated_at = ? WHERE user_id = ?').run(
      '',
      Date.now(),
      userId
    );
  }

  return res.json({ message: 'Media deleted' });
});

profilesRouter.post(
  '/media/voice',
  requireAuth,
  upload.single('voice'),
  (req: AuthenticatedRequest, res) => {
    if (!req.file) return res.status(400).json({ error: 'Audio file is required' });
    let validated;
    try {
      validated = validateMediaBuffer(req.file.buffer, 'audio');
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }

    const userId = req.auth!.sub;
    const mediaId = `voc_${crypto.randomUUID()}`;
    const filename = `${mediaId}.${validated.extension}`;
    const diskPath = resolveSafeStoragePath(storagePaths.mediaDir, filename);
    fs.writeFileSync(diskPath, req.file.buffer);

    const url = `/api/profiles/media/${mediaId}`;
    db.prepare(
      `INSERT INTO media_assets (id, owner_id, kind, mime_type, file_path, size_bytes, created_at)
       VALUES (?, ?, 'voice_intro', ?, ?, ?, ?)`
    ).run(mediaId, userId, validated.mimeType, filename, req.file.buffer.length, Date.now());

    db.prepare('UPDATE profiles SET voice_intro_url = ?, updated_at = ? WHERE user_id = ?').run(
      url,
      Date.now(),
      userId
    );

    return res.status(201).json({ voiceIntroUrl: url });
  }
);

/**
 * Controlled private media serving endpoint.
 * Enforces blocks, photo visibility settings, and Blind Connect mutual-consent photo reveal!
 */
profilesRouter.get('/media/:mediaId', requireAuth, (req: AuthenticatedRequest, res) => {
  const viewerId = req.auth!.sub;
  const asset = db
    .prepare('SELECT id, owner_id, kind, mime_type, file_path FROM media_assets WHERE id = ?')
    .get(req.params.mediaId) as
    | { id: string; owner_id: string; kind: string; mime_type: string; file_path: string }
    | undefined;

  if (!asset) return res.status(404).json({ error: 'Media asset not found' });

  const ownerId = asset.owner_id;
  if (viewerId !== ownerId) {
    if (isBlockedBetween(viewerId, ownerId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const consent = db
      .prepare('SELECT profile_visibility, photo_visibility FROM consent_records WHERE user_id = ?')
      .get(ownerId) as { profile_visibility: string; photo_visibility: string } | undefined;

    if (consent?.profile_visibility === 'hidden') {
      return res.status(403).json({ error: 'Profile media is hidden' });
    }

    const [, , pairKey] = computePairKey(viewerId, ownerId);
    const match = db
      .prepare('SELECT id, is_blind_match, photos_revealed, status FROM matches WHERE pair_key = ?')
      .get(pairKey) as
      | { id: string; is_blind_match: number; photos_revealed: number; status: string }
      | undefined;

    if (asset.kind === 'profile_photo') {
      // Blind Connect enforcement: hidden until BOTH users explicitly consent!
      if (match && match.status === 'active' && match.is_blind_match === 1 && match.photos_revealed === 0) {
        return res.status(403).json({
          error: 'Blind Connect photos remain hidden until both users consent to reveal.',
        });
      }
      if (consent?.photo_visibility === 'blind_only' && (!match || match.photos_revealed === 0)) {
        return res.status(403).json({ error: 'Photos are restricted to mutual Blind Connect reveal' });
      }
      if (consent?.photo_visibility === 'matches_only' && (!match || match.status !== 'active')) {
        return res.status(403).json({ error: 'Photos are visible to mutual matches only' });
      }
    }
  }

  const safePath = resolveSafeStoragePath(storagePaths.mediaDir, path.basename(asset.file_path));
  if (!fs.existsSync(safePath)) {
    return res.status(404).json({ error: 'Media file missing' });
  }
  res.setHeader('Content-Type', asset.mime_type);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.sendFile(safePath);
});

/**
 * Fetch another member's profile respecting privacy controls, blocks, and Blind Connect photo hiding.
 */
profilesRouter.get('/:userId', requireAuth, (req: AuthenticatedRequest, res) => {
  const viewerId = req.auth!.sub;
  const targetId = req.params.userId;

  if (viewerId !== targetId && isBlockedBetween(viewerId, targetId)) {
    return res.status(404).json({ error: 'Profile unavailable' });
  }

  const user = db
    .prepare('SELECT id, age_years, status, is_dev_demo FROM users WHERE id = ?')
    .get(targetId) as { id: string; age_years: number; status: string; is_dev_demo: number } | undefined;

  if (!user || user.status !== 'active') {
    return res.status(404).json({ error: 'Profile not found' });
  }

  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(targetId) as Record<
    string,
    unknown
  >;
  const consent = db.prepare('SELECT * FROM consent_records WHERE user_id = ?').get(targetId) as Record<
    string,
    unknown
  >;

  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  const [, , pairKey] = computePairKey(viewerId, targetId);
  const match = db
    .prepare('SELECT id, is_blind_match, photos_revealed, status FROM matches WHERE pair_key = ?')
    .get(pairKey) as
    | { id: string; is_blind_match: number; photos_revealed: number; status: string }
    | undefined;

  const isMatched = Boolean(match && match.status === 'active');

  if (viewerId !== targetId) {
    if (consent?.profile_visibility === 'hidden') {
      return res.status(403).json({ error: 'This profile is currently hidden' });
    }
    if (consent?.profile_visibility === 'matches_only' && !isMatched) {
      return res.status(403).json({ error: 'This profile is visible to matches only' });
    }
  }

  let hidePhotos = false;
  if (viewerId !== targetId) {
    if (match && match.is_blind_match === 1 && match.photos_revealed === 0) {
      hidePhotos = true;
    } else if (consent?.photo_visibility === 'blind_only' && (!match || match.photos_revealed === 0)) {
      hidePhotos = true;
    } else if (consent?.photo_visibility === 'matches_only' && !isMatched) {
      hidePhotos = true;
    }
  }

  // Strip first name only for Blind Connect until revealed
  const rawDisplay = String(profile.display_name || 'Member');
  const displayName = hidePhotos ? `${rawDisplay.split(' ')[0]} · Blind Match` : rawDisplay;

  return res.json({
    profile: {
      userId: targetId,
      displayName,
      age: user.age_years,
      gender: profile.gender,
      cityRegion: consent?.share_approx_location ? profile.city_region : 'Location hidden by user',
      occupation: hidePhotos ? 'Hidden until photo reveal' : profile.occupation,
      education: hidePhotos ? '' : profile.education,
      languages: JSON.parse(String(profile.languages || '[]')),
      bio: profile.bio,
      interests: JSON.parse(String(profile.interests || '[]')),
      favoriteMusic: profile.favorite_music,
      favoriteMovies: profile.favorite_movies,
      favoriteActivities: profile.favorite_activities,
      prompts: JSON.parse(String(profile.prompts || '[]')),
      photos: hidePhotos ? [] : JSON.parse(String(profile.photos || '[]')),
      photosHidden: hidePhotos,
      voiceIntroUrl: hidePhotos ? '' : profile.voice_intro_url,
      relationshipGoal: profile.relationship_goal,
      lifestyle: JSON.parse(String(profile.lifestyle || '{}')),
      verifiedBadge: Boolean(profile.verified_badge),
      blindConnectEnabled: Boolean(profile.blind_connect_enabled),
      isDevDemo: Boolean(user.is_dev_demo),
      matchId: isMatched ? match!.id : null,
      isBlindMatch: Boolean(match?.is_blind_match),
      photosRevealed: Boolean(match?.photos_revealed),
    },
  });
});
