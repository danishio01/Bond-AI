import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.ts';
import { db, writeAuditLog } from '../db/store.ts';
import {
  clearAuthCookies,
  requireAuth,
  setAuthCookies,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';
import { authRateLimiter } from '../middleware/rateLimit.ts';
import {
  computeBlindIndex,
  createTotpSecret,
  decryptField,
  encryptField,
  generateQrDataUrl,
  generateSecureToken,
  hashPassword,
  hashToken,
  verifyPassword,
  verifyTotpCode,
} from '../security/crypto.ts';

export const authRouter = Router();

function calculateAgeFromDob(dobStr: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dobStr)) return null;
  const [y, m, d] = dobStr.split('-').map(Number);
  const birth = new Date(Date.UTC(y, m - 1, d));
  if (
    Number.isNaN(birth.getTime()) ||
    birth.getUTCFullYear() !== y ||
    birth.getUTCMonth() !== m - 1 ||
    birth.getUTCDate() !== d
  ) {
    return null;
  }
  const now = new Date();
  let age = now.getUTCFullYear() - y;
  const monthDiff = now.getUTCMonth() - (m - 1);
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < d)) {
    age--;
  }
  return age;
}

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160),
  password: z
    .string()
    .min(10, 'Password must be at least 10 characters')
    .max(128)
    .regex(/[A-Z]/, 'Password must include an uppercase letter')
    .regex(/[a-z]/, 'Password must include a lowercase letter')
    .regex(/[0-9]/, 'Password must include a number'),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  acceptTerms: z.literal(true),
  acceptGuidelines: z.literal(true),
});

authRouter.post('/register', authRateLimiter, async (req, res) => {
  if (!env.enablePublicRegistration) {
    return res.status(403).json({
      error: 'Public registration is currently closed while production launch checks are completed.',
    });
  }

  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid registration data' });
  }

  const { name, email, password, dateOfBirth } = parsed.data;
  const age = calculateAgeFromDob(dateOfBirth);
  if (age === null) {
    return res.status(400).json({ error: 'Invalid date of birth' });
  }
  if (age < 18) {
    return res.status(403).json({ error: 'You must be at least 18 years old to register on BondAI.' });
  }
  if (age > 110) {
    return res.status(400).json({ error: 'Please enter a valid date of birth.' });
  }

  const blindIdx = computeBlindIndex(email);
  const existing = db.prepare('SELECT id FROM users WHERE email_blind_index = ?').get(blindIdx);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const userId = `usr_${crypto.randomUUID()}`;
  const passwordHash = await hashPassword(password);
  const now = Date.now();
  const verifyToken = generateSecureToken(24);
  const devCode = env.isProduction ? '' : verifyToken;

  const tx = db.prepare('BEGIN');
  tx.run();
  try {
    db.prepare(
      `INSERT INTO users (
        id, email_encrypted, email_blind_index, name_encrypted, dob_encrypted, age_years,
        password_hash, role, email_verified, totp_enabled, status, is_dev_demo, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'user', 0, 0, 'active', 0, ?, ?)`
    ).run(
      userId,
      encryptField(email.toLowerCase()),
      blindIdx,
      encryptField(name),
      encryptField(dateOfBirth),
      age,
      passwordHash,
      now,
      now
    );

    db.prepare(
      `INSERT INTO profiles (user_id, display_name, updated_at) VALUES (?, ?, ?)`
    ).run(userId, name.split(' ')[0] || name, now);

    db.prepare(`INSERT INTO preferences (user_id, updated_at) VALUES (?, ?)`).run(userId, now);

    db.prepare(
      `INSERT INTO personality_assessments (user_id, answers, values_vector, personality_vector, completed_count, updated_at)
       VALUES (?, '{}', '[]', '[]', 0, ?)`
    ).run(userId, now);

    // Privacy-protective defaults: online status off, read receipts off, AI consent explicit opt-in
    db.prepare(
      `INSERT INTO consent_records (
        user_id, profile_visibility, photo_visibility, show_online_status, read_receipts,
        share_approx_location, ai_processing_consent, discovery_paused, notifications_enabled,
        terms_accepted_at, updated_at
      ) VALUES (?, 'everyone', 'everyone', 0, 0, 1, 0, 0, 1, ?, ?)`
    ).run(userId, now, now);

    db.prepare(
      `INSERT INTO verification_records (id, user_id, kind, token_hash, dev_code, used, expires_at, created_at)
       VALUES (?, ?, 'email', ?, ?, 0, ?, ?)`
    ).run(
      crypto.randomUUID(),
      userId,
      hashToken(verifyToken),
      devCode,
      now + 24 * 60 * 60 * 1000,
      now
    );

    writeAuditLog(userId, 'USER_REGISTERED', userId, { ageVerified: true });
    db.prepare('COMMIT').run();
  } catch (err) {
    db.prepare('ROLLBACK').run();
    throw err;
  }

  return res.status(201).json({
    message: 'Account created. Please verify your email address before signing in.',
    userId,
    // Provided in non-production preview so verification flow is testable without SMTP
    ...(env.isProduction ? {} : { verificationTokenPreview: verifyToken }),
  });
});

authRouter.post('/verify-email', authRateLimiter, (req, res) => {
  const schema = z.object({ token: z.string().min(10).max(200) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid verification token format' });
  }

  const record = db
    .prepare(
      `SELECT id, user_id, used, expires_at FROM verification_records
       WHERE token_hash = ? AND kind = 'email'`
    )
    .get(hashToken(parsed.data.token)) as
    | { id: string; user_id: string; used: number; expires_at: number }
    | undefined;

  if (!record || record.used === 1 || record.expires_at < Date.now()) {
    return res.status(400).json({ error: 'Verification token is invalid or has expired' });
  }

  const now = Date.now();
  db.prepare('UPDATE verification_records SET used = 1 WHERE id = ?').run(record.id);
  db.prepare('UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?').run(
    now,
    record.user_id
  );
  writeAuditLog(record.user_id, 'EMAIL_VERIFIED', record.user_id);

  return res.json({ message: 'Email successfully verified. You may now sign in.' });
});

authRouter.post('/resend-verification', authRateLimiter, (req, res) => {
  const schema = z.object({ email: z.string().trim().email() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  const user = db
    .prepare('SELECT id, email_verified FROM users WHERE email_blind_index = ?')
    .get(computeBlindIndex(parsed.data.email)) as
    | { id: string; email_verified: number }
    | undefined;

  if (!user || user.email_verified === 1) {
    return res.json({
      message: 'If the account exists and is unverified, a verification token has been issued.',
    });
  }

  const token = generateSecureToken(24);
  const now = Date.now();
  db.prepare(
    `INSERT INTO verification_records (id, user_id, kind, token_hash, dev_code, used, expires_at, created_at)
     VALUES (?, ?, 'email', ?, ?, 0, ?, ?)`
  ).run(
    crypto.randomUUID(),
    user.id,
    hashToken(token),
    env.isProduction ? '' : token,
    now + 24 * 60 * 60 * 1000,
    now
  );

  return res.json({
    message: 'Verification token issued.',
    ...(env.isProduction ? {} : { verificationTokenPreview: token }),
  });
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128),
  totpCode: z.string().optional(),
  deviceLabel: z.string().trim().max(80).optional(),
});

authRouter.post('/login', authRateLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const { email, password, totpCode, deviceLabel } = parsed.data;
  const now = Date.now();
  const user = db
    .prepare(
      `SELECT id, password_hash, role, email_verified, totp_enabled, totp_secret_encrypted,
              status, is_dev_demo, failed_login_attempts, locked_until, last_login_ip, last_login_ua
       FROM users WHERE email_blind_index = ?`
    )
    .get(computeBlindIndex(email)) as
    | {
        id: string;
        password_hash: string;
        role: 'user' | 'moderator' | 'admin';
        email_verified: number;
        totp_enabled: number;
        totp_secret_encrypted: string;
        status: string;
        is_dev_demo: number;
        failed_login_attempts: number;
        locked_until: number;
        last_login_ip: string;
        last_login_ua: string;
      }
    | undefined;

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  if (user.locked_until > now) {
    const mins = Math.ceil((user.locked_until - now) / 60000);
    return res.status(423).json({
      error: `Account temporarily locked due to repeated failed logins. Try again in ${mins} minute(s).`,
    });
  }

  const valid = await verifyPassword(user.password_hash, password);
  if (!valid) {
    const attempts = user.failed_login_attempts + 1;
    const lockUntil = attempts >= 5 ? now + 15 * 60 * 1000 : 0;
    db.prepare('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?').run(
      attempts,
      lockUntil,
      user.id
    );
    writeAuditLog(user.id, 'LOGIN_FAILED', user.id, { attempts });
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  if (user.status === 'suspended') {
    return res.status(403).json({ error: 'This account is suspended pending moderation review.' });
  }

  if (user.email_verified === 0) {
    return res.status(403).json({
      error: 'Please verify your email address before signing in.',
      code: 'EMAIL_NOT_VERIFIED',
    });
  }

  let mfaVerified = false;
  if (user.totp_enabled === 1) {
    if (!totpCode) {
      return res.status(200).json({ mfaRequired: true, message: 'Enter your 6-digit authenticator code.' });
    }
    const secret = decryptField(user.totp_secret_encrypted);
    if (!verifyTotpCode(secret, totpCode)) {
      writeAuditLog(user.id, 'MFA_FAILED', user.id);
      return res.status(401).json({ error: 'Invalid 2FA authenticator code' });
    }
    mfaVerified = true;
  }

  // Suspicious login detection (new IP or User-Agent)
  const ip = req.ip || 'unknown';
  const ua = String(req.headers['user-agent'] || 'unknown').slice(0, 140);
  const suspicious =
    user.last_login_ip &&
    (user.last_login_ip !== ip || (user.last_login_ua && user.last_login_ua !== ua));

  if (suspicious) {
    db.prepare(
      `INSERT INTO notifications (id, user_id, type, title, body, link, read, created_at)
       VALUES (?, ?, 'security_alert', ?, ?, '/settings', 0, ?)`
    ).run(
      crypto.randomUUID(),
      user.id,
      'New device sign-in detected',
      `A new session signed in from ${deviceLabel || 'Web Browser'}. Review active sessions in Settings if this wasn't you.`,
      now
    );
  }

  // Reactivate paused/deactivated user only if not suspended (deactivated restores on explicit login)
  db.prepare(
    `UPDATE users SET failed_login_attempts = 0, locked_until = 0, status = 'active',
     last_login_ip = ?, last_login_ua = ?, updated_at = ? WHERE id = ?`
  ).run(ip, ua, now, user.id);

  const sessionId = `sess_${crypto.randomUUID()}`;
  const jti = generateSecureToken(16);
  const refreshToken = signRefreshToken({ sub: user.id, sessionId, jti });
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    sessionId,
    mfaVerified,
    emailVerified: true,
  });

  db.prepare(
    `INSERT INTO user_sessions (id, user_id, refresh_token_hash, device_info, ip_address, revoked, expires_at, created_at, last_used_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`
  ).run(
    sessionId,
    user.id,
    hashToken(refreshToken),
    deviceLabel || ua.slice(0, 80),
    ip,
    now + 7 * 24 * 60 * 60 * 1000,
    now,
    now
  );

  setAuthCookies(req, res, accessToken, refreshToken);
  writeAuditLog(user.id, 'LOGIN_SUCCESS', user.id, { mfaVerified, suspicious: Boolean(suspicious) });

  const profile = db
    .prepare('SELECT display_name, onboarding_step, blind_connect_enabled FROM profiles WHERE user_id = ?')
    .get(user.id) as
    | { display_name: string; onboarding_step: number; blind_connect_enabled: number }
    | undefined;

  return res.json({
    user: {
      id: user.id,
      role: user.role,
      emailVerified: true,
      totpEnabled: Boolean(user.totp_enabled),
      mfaVerified,
      isDevDemo: Boolean(user.is_dev_demo),
      displayName: profile?.display_name || 'Member',
      onboardingStep: profile?.onboarding_step || 1,
      blindConnectEnabled: Boolean(profile?.blind_connect_enabled),
    },
    accessToken,
  });
});

authRouter.post('/refresh', (req, res) => {
  const refreshCookie = req.cookies?.bondai_refresh || req.body?.refreshToken;
  if (!refreshCookie) {
    return res.status(401).json({ error: 'Refresh token missing' });
  }
  const payload = verifyRefreshToken(String(refreshCookie));
  if (!payload) {
    clearAuthCookies(req, res);
    return res.status(401).json({ error: 'Invalid refresh token' });
  }

  const session = db
    .prepare('SELECT * FROM user_sessions WHERE id = ? AND user_id = ?')
    .get(payload.sessionId, payload.sub) as
    | {
        id: string;
        user_id: string;
        refresh_token_hash: string;
        revoked: number;
        expires_at: number;
      }
    | undefined;

  const incomingHash = hashToken(String(refreshCookie));
  if (!session || session.revoked === 1 || session.expires_at < Date.now()) {
    clearAuthCookies(req, res);
    return res.status(401).json({ error: 'Session expired or revoked' });
  }

  // Detect refresh token reuse — revoke all sessions for safety
  if (session.refresh_token_hash !== incomingHash) {
    db.prepare('UPDATE user_sessions SET revoked = 1 WHERE user_id = ?').run(payload.sub);
    writeAuditLog(payload.sub, 'REFRESH_TOKEN_REUSE_DETECTED', payload.sub);
    clearAuthCookies(req, res);
    return res.status(401).json({ error: 'Security alert: refresh token reuse detected. Signed out everywhere.' });
  }

  const user = db
    .prepare('SELECT role, email_verified, totp_enabled, status FROM users WHERE id = ?')
    .get(payload.sub) as
    | { role: 'user' | 'moderator' | 'admin'; email_verified: number; totp_enabled: number; status: string }
    | undefined;

  if (!user || user.status === 'suspended' || user.status === 'deactivated') {
    return res.status(403).json({ error: 'Account inactive' });
  }

  const newRefresh = signRefreshToken({
    sub: payload.sub,
    sessionId: session.id,
    jti: generateSecureToken(16),
  });
  const newAccess = signAccessToken({
    sub: payload.sub,
    role: user.role,
    sessionId: session.id,
    mfaVerified: Boolean(user.totp_enabled),
    emailVerified: Boolean(user.email_verified),
  });

  db.prepare('UPDATE user_sessions SET refresh_token_hash = ?, last_used_at = ? WHERE id = ?').run(
    hashToken(newRefresh),
    Date.now(),
    session.id
  );
  setAuthCookies(req, res, newAccess, newRefresh);

  return res.json({ accessToken: newAccess });
});

authRouter.post('/logout', requireAuth, (req: AuthenticatedRequest, res) => {
  if (req.auth) {
    db.prepare('UPDATE user_sessions SET revoked = 1 WHERE id = ?').run(req.auth.sessionId);
    writeAuditLog(req.auth.sub, 'LOGOUT', req.auth.sessionId);
  }
  clearAuthCookies(req, res);
  return res.json({ message: 'Signed out' });
});

authRouter.post('/logout-all', requireAuth, (req: AuthenticatedRequest, res) => {
  if (req.auth) {
    db.prepare('UPDATE user_sessions SET revoked = 1 WHERE user_id = ?').run(req.auth.sub);
    writeAuditLog(req.auth.sub, 'LOGOUT_ALL_DEVICES', req.auth.sub);
  }
  clearAuthCookies(req, res);
  return res.json({ message: 'Signed out from all devices' });
});

authRouter.post('/forgot-password', authRateLimiter, (req, res) => {
  const schema = z.object({ email: z.string().trim().email() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  const user = db
    .prepare('SELECT id FROM users WHERE email_blind_index = ?')
    .get(computeBlindIndex(parsed.data.email)) as { id: string } | undefined;

  let previewToken: string | undefined;
  if (user) {
    const token = generateSecureToken(24);
    const now = Date.now();
    db.prepare(
      `INSERT INTO verification_records (id, user_id, kind, token_hash, dev_code, used, expires_at, created_at)
       VALUES (?, ?, 'password_reset', ?, ?, 0, ?, ?)`
    ).run(
      crypto.randomUUID(),
      user.id,
      hashToken(token),
      env.isProduction ? '' : token,
      now + 30 * 60 * 1000,
      now
    );
    writeAuditLog(user.id, 'PASSWORD_RESET_REQUESTED', user.id);
    if (!env.isProduction) previewToken = token;
  }

  return res.json({
    message: 'If an account matches that email, a single-use reset token (valid 30 minutes) was created.',
    ...(previewToken ? { resetTokenPreview: previewToken } : {}),
  });
});

authRouter.post('/reset-password', authRateLimiter, async (req, res) => {
  const schema = z.object({
    token: z.string().min(10).max(200),
    newPassword: z
      .string()
      .min(10)
      .max(128)
      .regex(/[A-Z]/)
      .regex(/[a-z]/)
      .regex(/[0-9]/),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Valid reset token and strong password (10+ chars, upper, lower, number) required' });
  }

  const record = db
    .prepare(
      `SELECT id, user_id, used, expires_at FROM verification_records
       WHERE token_hash = ? AND kind = 'password_reset'`
    )
    .get(hashToken(parsed.data.token)) as
    | { id: string; user_id: string; used: number; expires_at: number }
    | undefined;

  if (!record || record.used === 1 || record.expires_at < Date.now()) {
    return res.status(400).json({ error: 'Reset token is invalid or expired' });
  }

  const newHash = await hashPassword(parsed.data.newPassword);
  const now = Date.now();
  db.prepare('UPDATE verification_records SET used = 1 WHERE id = ?').run(record.id);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
    newHash,
    now,
    record.user_id
  );
  // Revoke all active sessions after password reset
  db.prepare('UPDATE user_sessions SET revoked = 1 WHERE user_id = ?').run(record.user_id);
  writeAuditLog(record.user_id, 'PASSWORD_RESET_COMPLETED', record.user_id);

  return res.json({ message: 'Password updated and all previous sessions signed out.' });
});

authRouter.post('/change-password', requireAuth, async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(10).max(128).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Current password and strong new password required' });
  }

  const user = db
    .prepare('SELECT password_hash FROM users WHERE id = ?')
    .get(req.auth!.sub) as { password_hash: string } | undefined;

  if (!user || !(await verifyPassword(user.password_hash, parsed.data.currentPassword))) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const newHash = await hashPassword(parsed.data.newPassword);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
    newHash,
    Date.now(),
    req.auth!.sub
  );
  writeAuditLog(req.auth!.sub, 'PASSWORD_CHANGED', req.auth!.sub);
  return res.json({ message: 'Password updated successfully' });
});

authRouter.post('/2fa/setup', requireAuth, async (req: AuthenticatedRequest, res) => {
  const user = db
    .prepare('SELECT email_encrypted FROM users WHERE id = ?')
    .get(req.auth!.sub) as { email_encrypted: string } | undefined;
  if (!user) return res.status(404).json({ error: 'User not found' });

  const email = decryptField(user.email_encrypted);
  const { base32, otpauthUri } = createTotpSecret(email);
  const qrDataUrl = await generateQrDataUrl(otpauthUri);

  // Store pending secret encrypted until verified
  db.prepare('UPDATE users SET totp_secret_encrypted = ?, updated_at = ? WHERE id = ?').run(
    encryptField(base32),
    Date.now(),
    req.auth!.sub
  );

  return res.json({ secret: base32, qrDataUrl, otpauthUri });
});

authRouter.post('/2fa/verify', requireAuth, (req: AuthenticatedRequest, res) => {
  const schema = z.object({ code: z.string().min(6).max(8) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: '6-digit code is required' });
  }

  const user = db
    .prepare('SELECT totp_secret_encrypted, role, email_verified FROM users WHERE id = ?')
    .get(req.auth!.sub) as
    | { totp_secret_encrypted: string; role: 'user' | 'moderator' | 'admin'; email_verified: number }
    | undefined;
  if (!user || !user.totp_secret_encrypted) {
    return res.status(400).json({ error: 'Initialize 2FA setup first' });
  }

  const secret = decryptField(user.totp_secret_encrypted);
  if (!verifyTotpCode(secret, parsed.data.code)) {
    return res.status(400).json({ error: 'Invalid 2FA code' });
  }

  db.prepare('UPDATE users SET totp_enabled = 1, updated_at = ? WHERE id = ?').run(
    Date.now(),
    req.auth!.sub
  );
  writeAuditLog(req.auth!.sub, 'MFA_ENABLED', req.auth!.sub);

  // Refresh access token with mfaVerified: true
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

  return res.json({ message: 'Two-factor authentication enabled', mfaVerified: true, accessToken: newAccess });
});

authRouter.post('/2fa/disable', requireAuth, async (req: AuthenticatedRequest, res) => {
  const schema = z.object({ password: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Password required' });

  const user = db
    .prepare('SELECT password_hash, role FROM users WHERE id = ?')
    .get(req.auth!.sub) as { password_hash: string; role: string } | undefined;
  if (!user || !(await verifyPassword(user.password_hash, parsed.data.password))) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  if (user.role === 'admin') {
    return res.status(403).json({ error: 'Administrators cannot disable mandatory 2FA' });
  }

  db.prepare('UPDATE users SET totp_enabled = 0, totp_secret_encrypted = ?, updated_at = ? WHERE id = ?').run(
    '',
    Date.now(),
    req.auth!.sub
  );
  writeAuditLog(req.auth!.sub, 'MFA_DISABLED', req.auth!.sub);
  return res.json({ message: 'Two-factor authentication disabled' });
});

authRouter.get('/sessions', requireAuth, (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT id, device_info, ip_address, created_at, last_used_at, expires_at
       FROM user_sessions WHERE user_id = ? AND revoked = 0 AND expires_at > ?
       ORDER BY last_used_at DESC`
    )
    .all(req.auth!.sub, Date.now()) as Array<{
    id: string;
    device_info: string;
    ip_address: string;
    created_at: number;
    last_used_at: number;
    expires_at: number;
  }>;

  return res.json({
    sessions: rows.map((r) => ({
      id: r.id,
      deviceInfo: r.device_info,
      ipMasked: r.ip_address.replace(/\.\d+$/, '.***'),
      isCurrent: r.id === req.auth!.sessionId,
      createdAt: r.created_at,
      lastUsedAt: r.last_used_at,
    })),
  });
});

authRouter.delete('/sessions/:sessionId', requireAuth, (req: AuthenticatedRequest, res) => {
  const result = db
    .prepare('UPDATE user_sessions SET revoked = 1 WHERE id = ? AND user_id = ?')
    .run(req.params.sessionId, req.auth!.sub);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Session not found' });
  }
  writeAuditLog(req.auth!.sub, 'SESSION_REVOKED', req.params.sessionId);
  return res.json({ message: 'Session revoked' });
});

authRouter.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = db
    .prepare(
      `SELECT id, email_encrypted, name_encrypted, age_years, role, email_verified, totp_enabled, status, is_dev_demo, created_at
       FROM users WHERE id = ?`
    )
    .get(req.auth!.sub) as
    | {
        id: string;
        email_encrypted: string;
        name_encrypted: string;
        age_years: number;
        role: 'user' | 'moderator' | 'admin';
        email_verified: number;
        totp_enabled: number;
        status: string;
        is_dev_demo: number;
        created_at: number;
      }
    | undefined;

  if (!user) return res.status(404).json({ error: 'User not found' });

  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(user.id) as Record<
    string,
    unknown
  >;
  const prefs = db.prepare('SELECT * FROM preferences WHERE user_id = ?').get(user.id) as Record<
    string,
    unknown
  >;
  const consent = db.prepare('SELECT * FROM consent_records WHERE user_id = ?').get(user.id) as Record<
    string,
    unknown
  >;
  const assessment = db
    .prepare('SELECT completed_count, answers FROM personality_assessments WHERE user_id = ?')
    .get(user.id) as { completed_count: number; answers: string } | undefined;

  return res.json({
    user: {
      id: user.id,
      email: decryptField(user.email_encrypted),
      name: decryptField(user.name_encrypted),
      age: user.age_years,
      role: user.role,
      emailVerified: Boolean(user.email_verified),
      totpEnabled: Boolean(user.totp_enabled),
      mfaVerified: req.auth!.mfaVerified,
      status: user.status,
      isDevDemo: Boolean(user.is_dev_demo),
      createdAt: user.created_at,
    },
    profile: profile
      ? {
          displayName: profile.display_name,
          gender: profile.gender,
          datingPreferences: JSON.parse(String(profile.dating_preferences || '[]')),
          cityRegion: profile.city_region,
          occupation: profile.occupation,
          education: profile.education,
          languages: JSON.parse(String(profile.languages || '[]')),
          bio: profile.bio,
          interests: JSON.parse(String(profile.interests || '[]')),
          favoriteMusic: profile.favorite_music,
          favoriteMovies: profile.favorite_movies,
          favoriteActivities: profile.favorite_activities,
          prompts: JSON.parse(String(profile.prompts || '[]')),
          photos: JSON.parse(String(profile.photos || '[]')),
          voiceIntroUrl: profile.voice_intro_url,
          relationshipGoal: profile.relationship_goal,
          lifestyle: JSON.parse(String(profile.lifestyle || '{}')),
          verifiedBadge: Boolean(profile.verified_badge),
          blindConnectEnabled: Boolean(profile.blind_connect_enabled),
          onboardingStep: Number(profile.onboarding_step || 1),
        }
      : null,
    preferences: prefs
      ? {
          minAge: prefs.min_age,
          maxAge: prefs.max_age,
          maxDistanceKm: prefs.max_distance_km,
          preferredGenders: JSON.parse(String(prefs.preferred_genders || '["Everyone"]')),
          relationshipGoals: JSON.parse(String(prefs.relationship_goals || '[]')),
          lifestyleFilters: JSON.parse(String(prefs.lifestyle_filters || '{}')),
          weights: JSON.parse(
            String(prefs.weights || '{"values":25,"personality":25,"interests":20,"goals":20,"lifestyle":10}')
          ),
        }
      : null,
    consent: consent
      ? {
          profileVisibility: consent.profile_visibility,
          photoVisibility: consent.photo_visibility,
          showOnlineStatus: Boolean(consent.show_online_status),
          readReceipts: Boolean(consent.read_receipts),
          shareApproxLocation: Boolean(consent.share_approx_location),
          aiProcessingConsent: Boolean(consent.ai_processing_consent),
          discoveryPaused: Boolean(consent.discovery_paused),
          notificationsEnabled: Boolean(consent.notifications_enabled),
        }
      : null,
    assessment: assessment
      ? {
          completedCount: assessment.completed_count,
          answers: JSON.parse(assessment.answers || '{}'),
        }
      : { completedCount: 0, answers: {} },
  });
});

authRouter.get('/dev-demo-accounts', (_req, res) => {
  if (!env.enableDevDemoAccounts) {
    return res.json({ enabled: false, accounts: [] });
  }
  const rows = db
    .prepare(
      `SELECT u.id, u.email_encrypted, p.display_name, p.city_region, p.occupation
       FROM users u JOIN profiles p ON p.user_id = u.id
       WHERE u.is_dev_demo = 1 ORDER BY u.id ASC`
    )
    .all() as Array<{
    id: string;
    email_encrypted: string;
    display_name: string;
    city_region: string;
    occupation: string;
  }>;

  return res.json({
    enabled: true,
    note: 'Fictional development demo accounts only (disabled in production).',
    accounts: rows.map((r) => ({
      id: r.id,
      email: decryptField(r.email_encrypted),
      displayName: r.display_name,
      cityRegion: r.city_region,
      occupation: r.occupation,
    })),
  });
});
