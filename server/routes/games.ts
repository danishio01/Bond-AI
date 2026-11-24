import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/store.ts';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.ts';
import { emitToUser } from '../realtime/socket.ts';
import { generateGameInsight } from '../services/gemini.ts';

export const gamesRouter = Router();

const GAME_BANK: Record<string, Array<{ prompt: string; options: string[] }>> = {
  'Would You Rather': [
    {
      prompt: 'For a spontaneous 3-day getaway, would you rather...',
      options: ['A quiet cabin in misty pines', 'A bustling culinary & museum city trip'],
    },
    {
      prompt: 'For a Sunday ritual together, would you rather...',
      options: ['Cook an ambitious brunch from scratch', 'Walk to a local bakery and read in the park'],
    },
  ],
  'This or That': [
    {
      prompt: 'Sunrise trail walk or midnight jazz vinyl session?',
      options: ['Sunrise trail walk', 'Midnight jazz vinyl session'],
    },
    {
      prompt: 'Handwritten letter or spontaneous 10-minute voice note?',
      options: ['Handwritten letter', 'Spontaneous voice note'],
    },
  ],
  'Two Truths and a Lie': [
    {
      prompt: 'Share two true facts and one playful fib — your match guesses which is the lie!',
      options: [],
    },
  ],
  'Travel Preferences': [
    {
      prompt: 'What is one destination you would return to twice, and why?',
      options: [],
    },
  ],
  'Future Goals': [
    {
      prompt: 'What personal skill or creative project do you want to nurture over the next two years?',
      options: [],
    },
  ],
};

function verifyMatch(matchId: string, userId: string) {
  return db
    .prepare("SELECT * FROM matches WHERE id = ? AND (user_a = ? OR user_b = ?) AND status = 'active'")
    .get(matchId, userId, userId) as
    | { id: string; user_a: string; user_b: string }
    | undefined;
}

gamesRouter.get('/:matchId', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.auth!.sub;
  const match = verifyMatch(req.params.matchId, userId);
  if (!match) return res.status(403).json({ error: 'Active match required' });

  const isUserA = match.user_a === userId;
  const rows = db
    .prepare('SELECT * FROM compatibility_activities WHERE match_id = ? ORDER BY created_at DESC LIMIT 30')
    .all(match.id) as Array<Record<string, unknown>>;

  return res.json({
    gameTypes: Object.keys(GAME_BANK),
    activities: rows.map((r) => {
      const bothConsented =
        Boolean(r.user_a_consent_reveal) && Boolean(r.user_b_consent_reveal);
      const myAnswer = isUserA ? String(r.user_a_answer) : String(r.user_b_answer);
      const partnerAnswerRaw = isUserA ? String(r.user_b_answer) : String(r.user_a_answer);

      return {
        id: r.id,
        gameType: r.game_type,
        promptText: r.prompt_text,
        options: JSON.parse(String(r.options_json || '[]')),
        myAnswer,
        partnerAnswered: Boolean(partnerAnswerRaw),
        partnerAnswer: bothConsented ? partnerAnswerRaw : '',
        myConsentReveal: isUserA ? Boolean(r.user_a_consent_reveal) : Boolean(r.user_b_consent_reveal),
        partnerConsentReveal: isUserA
          ? Boolean(r.user_b_consent_reveal)
          : Boolean(r.user_a_consent_reveal),
        bothRevealed: bothConsented,
        aiSummary: bothConsented ? String(r.ai_summary || '') : '',
        createdAt: r.created_at,
      };
    }),
  });
});

gamesRouter.post('/:matchId', requireAuth, (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    gameType: z.enum([
      'Would You Rather',
      'This or That',
      'Two Truths and a Lie',
      'Travel Preferences',
      'Future Goals',
    ]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid game type' });

  const userId = req.auth!.sub;
  const match = verifyMatch(req.params.matchId, userId);
  if (!match) return res.status(403).json({ error: 'Active match required' });

  const bank = GAME_BANK[parsed.data.gameType];
  const pick = bank[Math.floor(Math.random() * bank.length)];
  const id = `gam_${crypto.randomUUID()}`;
  const now = Date.now();

  db.prepare(
    `INSERT INTO compatibility_activities (
      id, match_id, game_type, prompt_text, options_json, user_a_answer, user_b_answer,
      user_a_consent_reveal, user_b_consent_reveal, ai_summary, created_at
    ) VALUES (?, ?, ?, ?, ?, '', '', 0, 0, '', ?)`
  ).run(id, match.id, parsed.data.gameType, pick.prompt, JSON.stringify(pick.options), now);

  const partnerId = match.user_a === userId ? match.user_b : match.user_a;
  emitToUser(partnerId, 'game:updated', { matchId: match.id, gameId: id });

  return res.status(201).json({ id, gameType: parsed.data.gameType, promptText: pick.prompt, options: pick.options });
});

gamesRouter.post('/:matchId/:gameId/answer', requireAuth, async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    answer: z.string().trim().min(1).max(400),
    consentReveal: z.boolean().default(true),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Answer is required' });

  const userId = req.auth!.sub;
  const match = verifyMatch(req.params.matchId, userId);
  if (!match) return res.status(403).json({ error: 'Active match required' });

  const row = db
    .prepare('SELECT * FROM compatibility_activities WHERE id = ? AND match_id = ?')
    .get(req.params.gameId, match.id) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: 'Game round not found' });

  const isUserA = match.user_a === userId;
  const partnerId = isUserA ? match.user_b : match.user_a;

  const nextA = isUserA ? parsed.data.answer : String(row.user_a_answer);
  const nextB = !isUserA ? parsed.data.answer : String(row.user_b_answer);
  const nextConsentA = isUserA ? (parsed.data.consentReveal ? 1 : 0) : Number(row.user_a_consent_reveal);
  const nextConsentB = !isUserA ? (parsed.data.consentReveal ? 1 : 0) : Number(row.user_b_consent_reveal);

  let aiSummary = String(row.ai_summary || '');
  if (nextA && nextB && nextConsentA === 1 && nextConsentB === 1 && !aiSummary) {
    const cA = db.prepare('SELECT ai_processing_consent FROM consent_records WHERE user_id = ?').get(match.user_a) as
      | { ai_processing_consent: number }
      | undefined;
    const cB = db.prepare('SELECT ai_processing_consent FROM consent_records WHERE user_id = ?').get(match.user_b) as
      | { ai_processing_consent: number }
      | undefined;
    const bothAiConsent = Boolean(cA?.ai_processing_consent && cB?.ai_processing_consent);
    const insight = await generateGameInsight({
      hasConsent: bothAiConsent,
      gameType: String(row.game_type),
      promptText: String(row.prompt_text),
      answerA: nextA,
      answerB: nextB,
    });
    aiSummary = insight.summary;
  }

  db.prepare(
    `UPDATE compatibility_activities SET
      user_a_answer = ?, user_b_answer = ?, user_a_consent_reveal = ?, user_b_consent_reveal = ?, ai_summary = ?
     WHERE id = ?`
  ).run(nextA, nextB, nextConsentA, nextConsentB, aiSummary, String(row.id));

  emitToUser(partnerId, 'game:updated', { matchId: match.id, gameId: String(row.id) });
  return res.json({ saved: true, bothRevealed: nextConsentA === 1 && nextConsentB === 1 });
});
