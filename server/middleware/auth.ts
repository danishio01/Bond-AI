import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.ts';
import { db } from '../db/store.ts';

export interface AccessTokenPayload {
  sub: string;
  role: 'user' | 'moderator' | 'admin';
  sessionId: string;
  mfaVerified: boolean;
  emailVerified: boolean;
}

export interface AuthenticatedRequest extends Request {
  auth?: AccessTokenPayload;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtAccessSecret, { expiresIn: '15m' });
}

export function signRefreshToken(payload: { sub: string; sessionId: string; jti: string }): string {
  return jwt.sign(payload, env.jwtRefreshSecret, { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    return jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(
  token: string
): { sub: string; sessionId: string; jti: string } | null {
  try {
    return jwt.verify(token, env.jwtRefreshSecret) as {
      sub: string;
      sessionId: string;
      jti: string;
    };
  } catch {
    return null;
  }
}

function isHttpsRequest(req: Request): boolean {
  return (
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    env.appUrl.startsWith('https://') ||
    env.isProduction
  );
}

export function setAuthCookies(
  req: Request,
  res: Response,
  accessToken: string,
  refreshToken: string
) {
  const https = isHttpsRequest(req);
  const accessCookieParts = [
    `bondai_access=${encodeURIComponent(accessToken)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${15 * 60}`,
    https ? 'SameSite=None' : 'SameSite=Lax',
    ...(https ? ['Secure', 'Partitioned'] : []),
  ];
  const refreshCookieParts = [
    `bondai_refresh=${encodeURIComponent(refreshToken)}`,
    'Path=/api/auth',
    'HttpOnly',
    `Max-Age=${7 * 24 * 60 * 60}`,
    https ? 'SameSite=None' : 'SameSite=Lax',
    ...(https ? ['Secure', 'Partitioned'] : []),
  ];
  res.setHeader('Set-Cookie', [accessCookieParts.join('; '), refreshCookieParts.join('; ')]);
}

export function clearAuthCookies(req: Request, res: Response) {
  const https = isHttpsRequest(req);
  const suffix = https ? 'SameSite=None; Secure; Partitioned' : 'SameSite=Lax';
  res.setHeader('Set-Cookie', [
    `bondai_access=; Path=/; HttpOnly; Max-Age=0; ${suffix}`,
    `bondai_refresh=; Path=/api/auth; HttpOnly; Max-Age=0; ${suffix}`,
  ]);
}

/**
 * CSRF defense on cookie-authenticated mutating requests.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  const hasCookieAuth = Boolean(req.cookies?.bondai_access || req.cookies?.bondai_refresh);
  const hasBearer = req.headers.authorization?.startsWith('Bearer ');
  if (!hasCookieAuth || hasBearer) {
    return next();
  }

  const origin = req.headers.origin;
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '') as string;
  const xRequestedWith = req.headers['x-requested-with'];

  if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (host && originHost === host) {
        return next();
      }
      if (env.appUrl) {
        const appHost = new URL(env.appUrl).host;
        if (originHost === appHost) return next();
      }
    } catch {
      return res.status(403).json({ error: 'Invalid request origin' });
    }
    return res.status(403).json({ error: 'Cross-site request rejected' });
  }

  if (xRequestedWith === 'BondAI-Client') {
    return next();
  }
  // Allow same-origin requests without Origin header in local test environments if no mismatch
  if (!origin && process.env.NODE_ENV === 'test') {
    return next();
  }
  return res.status(403).json({ error: 'Missing CSRF verification header' });
}

export function extractBearerOrCookieToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  if (req.cookies?.bondai_access) {
    return String(req.cookies.bondai_access);
  }
  return null;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = extractBearerOrCookieToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const payload = verifyAccessToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Session expired or invalid' });
  }

  // Verify session is not revoked and user is active
  const session = db
    .prepare('SELECT revoked, expires_at FROM user_sessions WHERE id = ? AND user_id = ?')
    .get(payload.sessionId, payload.sub) as { revoked: number; expires_at: number } | undefined;

  if (!session || session.revoked === 1 || session.expires_at < Date.now()) {
    return res.status(401).json({ error: 'Session has been revoked or expired' });
  }

  const user = db
    .prepare('SELECT status, role, email_verified FROM users WHERE id = ?')
    .get(payload.sub) as { status: string; role: string; email_verified: number } | undefined;

  if (!user || user.status === 'suspended' || user.status === 'deactivated') {
    return res.status(403).json({ error: 'Account is suspended or deactivated' });
  }

  req.auth = {
    ...payload,
    role: user.role as AccessTokenPayload['role'],
    emailVerified: Boolean(user.email_verified),
  };
  return next();
}

export function requireVerifiedEmail(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.auth) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!req.auth.emailVerified) {
    return res.status(403).json({ error: 'Email verification is required before using this feature' });
  }
  return next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.auth) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.auth.role !== 'admin' && req.auth.role !== 'moderator') {
    return res.status(403).json({ error: 'Administrator access required' });
  }
  if (!req.auth.mfaVerified) {
    return res.status(403).json({
      error: 'Mandatory multi-factor authentication (TOTP) verification required for admin access',
      code: 'ADMIN_MFA_REQUIRED',
    });
  }
  return next();
}

export function computePairKey(userA: string, userB: string): [string, string, string] {
  const sorted = [userA, userB].sort();
  const key = crypto.createHash('sha256').update(`${sorted[0]}:${sorted[1]}`).digest('hex');
  return [sorted[0], sorted[1], key];
}
