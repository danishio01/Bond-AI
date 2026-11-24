import rateLimit from 'express-rate-limit';
import type { NextFunction, Response } from 'express';
import { env } from '../config/env.ts';
import { cache } from '../db/redis.ts';
import type { AuthenticatedRequest } from './auth.ts';

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 200 : 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please wait 15 minutes and try again.' },
});

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 500 : 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded. Please slow down briefly.' },
});

export async function aiQuotaMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.auth) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const dayKey = new Date().toISOString().slice(0, 10);
  const key = `ai_quota:${req.auth.sub}:${dayKey}`;
  const count = await cache.incrWithTtl(key, 86400);
  if (count > env.aiDailyQuota) {
    return res.status(429).json({
      error: `Daily AI assistance quota (${env.aiDailyQuota}) reached. Core matching and messaging remain active.`,
    });
  }
  return next();
}
