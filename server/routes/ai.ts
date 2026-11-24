import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/store.ts';
import { computePairKey, requireAuth, type AuthenticatedRequest } from '../middleware/auth.ts';
import { aiQuotaMiddleware } from '../middleware/rateLimit.ts';
import { computeExplainableCompatibility } from '../services/matching.ts';
import {
  generateCompatibilityExplanation,
  generateDateIdeas,
  generateIcebreakers,
  generateProfileAssistance,
} from '../services/gemini.ts';
import { loadCandidateRecord } from './discovery.ts';

export const aiRouter = Router();

function hasAiConsent(userId: string): boolean {
  const row = db
    .prepare('SELECT ai_processing_consent FROM consent_records WHERE user_id = ?')
    .get(userId) as { ai_processing_consent: number } | undefined;
  return Boolean(row?.ai_processing_consent);
}

aiRouter.get(
  '/compatibility/:targetUserId',
  requireAuth,
  aiQuotaMiddleware,
  async (req: AuthenticatedRequest, res) => {
    const viewerId = req.auth!.sub;
    const targetId = req.params.targetUserId;

    const viewer = loadCandidateRecord(viewerId);
    const target = loadCandidateRecord(targetId);
    if (!viewer || !target) {
      return res.status(404).json({ error: 'Profile unavailable' });
    }

    const blocked = db
      .prepare(
        'SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_user_id = ?) OR (blocker_id = ? AND blocked_user_id = ?)'
      )
      .get(viewerId, targetId, targetId, viewerId);
    if (blocked) return res.status(403).json({ error: 'Profile unavailable' });

    const compat = computeExplainableCompatibility(viewer, target);
    const consent = hasAiConsent(viewerId);

    const { explanation, usedAi } = await generateCompatibilityExplanation({
      hasConsent: consent,
      viewerFirstName: viewer.displayName.split(' ')[0],
      candidateFirstName: target.displayName.split(' ')[0],
      result: compat,
    });

    return res.json({
      compatibility: compat,
      explanation,
      usedAi,
      aiConsentActive: consent,
    });
  }
);

aiRouter.post(
  '/icebreakers',
  requireAuth,
  aiQuotaMiddleware,
  async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      matchId: z.string().min(3).max(80),
      category: z
        .enum(['Funny', 'Thoughtful', 'Casual', 'Creative', 'Travel-related', 'Personality-based'])
        .default('Thoughtful'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid icebreaker request' });

    const userId = req.auth!.sub;
    const match = db
      .prepare("SELECT user_a, user_b FROM matches WHERE id = ? AND (user_a = ? OR user_b = ?) AND status = 'active'")
      .get(parsed.data.matchId, userId, userId) as { user_a: string; user_b: string } | undefined;
    if (!match) return res.status(403).json({ error: 'Active match required' });

    const partnerId = match.user_a === userId ? match.user_b : match.user_a;
    const viewer = loadCandidateRecord(userId);
    const partner = loadCandidateRecord(partnerId);
    if (!viewer || !partner) return res.status(404).json({ error: 'Profile not found' });

    const compat = computeExplainableCompatibility(viewer, partner);
    const consent = hasAiConsent(userId);

    const out = await generateIcebreakers({
      hasConsent: consent,
      category: parsed.data.category,
      sharedInterests: compat.sharedInterests,
      candidatePrompts: partner.prompts,
      relationshipGoal: partner.relationshipGoal,
    });

    return res.json({ ...out, aiConsentActive: consent });
  }
);

aiRouter.post(
  '/profile-assistant',
  requireAuth,
  aiQuotaMiddleware,
  async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      mode: z.enum(['improve_bio', 'grammar', 'variations', 'prompts', 'completeness']),
      bio: z.string().max(600).default(''),
      interests: z.array(z.string().max(40)).max(15).default([]),
      occupation: z.string().max(80).default(''),
      favoriteMusic: z.string().max(150).default(''),
      favoriteMovies: z.string().max(150).default(''),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid profile assistant request' });

    const consent = hasAiConsent(req.auth!.sub);
    const out = await generateProfileAssistance({
      hasConsent: consent,
      ...parsed.data,
    });
    return res.json({ ...out, aiConsentActive: consent });
  }
);

aiRouter.post(
  '/date-planner',
  requireAuth,
  aiQuotaMiddleware,
  async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      matchId: z.string().min(3).max(80),
      budget: z.string().trim().max(40).default('Moderate ($20–$45)'),
      dietary: z.string().trim().max(80).default('Flexible'),
      availability: z.string().trim().max(80).default('Weekend afternoon'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid date planner request' });

    const userId = req.auth!.sub;
    const match = db
      .prepare("SELECT id, user_a, user_b FROM matches WHERE id = ? AND (user_a = ? OR user_b = ?) AND status = 'active'")
      .get(parsed.data.matchId, userId, userId) as
      | { id: string; user_a: string; user_b: string }
      | undefined;
    if (!match) return res.status(403).json({ error: 'Active match required' });

    const partnerId = match.user_a === userId ? match.user_b : match.user_a;
    const viewer = loadCandidateRecord(userId);
    const partner = loadCandidateRecord(partnerId);
    if (!viewer || !partner) return res.status(404).json({ error: 'Profile not found' });

    const compat = computeExplainableCompatibility(viewer, partner);
    const consent = hasAiConsent(userId);
    const partnerConsent = db
      .prepare('SELECT share_approx_location FROM consent_records WHERE user_id = ?')
      .get(partnerId) as { share_approx_location: number } | undefined;

    const approxCity =
      partnerConsent?.share_approx_location && partner.cityRegion
        ? partner.cityRegion.split('·')[0].trim()
        : viewer.cityRegion.split('·')[0].trim() || 'your city center';

    const out = await generateDateIdeas({
      hasConsent: consent,
      sharedInterests: compat.sharedInterests,
      approxCity,
      budget: parsed.data.budget,
      dietary: parsed.data.dietary,
      availability: parsed.data.availability,
    });

    const planId = `dpl_${crypto.randomUUID()}`;
    db.prepare(
      `INSERT INTO date_plans (id, match_id, created_by, budget, dietary, ideas_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(planId, match.id, userId, parsed.data.budget, parsed.data.dietary, JSON.stringify(out.ideas), Date.now());

    return res.json({
      planId,
      ideas: out.ideas,
      usedAi: out.usedAi,
      aiConsentActive: consent,
      notice:
        'Venue hours and availability are not live-verified; confirm public hours directly and meet in well-lit public places.',
    });
  }
);

aiRouter.get('/date-planner/:matchId', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.auth!.sub;
  const match = db
    .prepare("SELECT id FROM matches WHERE id = ? AND (user_a = ? OR user_b = ?) AND status = 'active'")
    .get(req.params.matchId, userId, userId);
  if (!match) return res.status(403).json({ error: 'Forbidden' });

  const rows = db
    .prepare('SELECT * FROM date_plans WHERE match_id = ? ORDER BY created_at DESC LIMIT 10')
    .all(req.params.matchId) as Array<Record<string, unknown>>;

  return res.json({
    plans: rows.map((r) => ({
      id: r.id,
      budget: r.budget,
      dietary: r.dietary,
      ideas: JSON.parse(String(r.ideas_json || '[]')),
      createdAt: r.created_at,
    })),
  });
});
