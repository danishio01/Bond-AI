import crypto from 'node:crypto';
import path from 'node:path';
import argon2 from 'argon2';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { env } from '../config/env.ts';

function derive32ByteKey(rawSecret: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(rawSecret)) {
    return Buffer.from(rawSecret, 'hex');
  }
  return crypto.createHash('sha256').update(rawSecret, 'utf8').digest();
}

const CURRENT_KEY_VERSION = 'v1';
const PRIMARY_AES_KEY = derive32ByteKey(env.fieldEncryptionMasterKey);
const LEGACY_KEYS = new Map<string, Buffer>();
for (const entry of env.fieldEncryptionPreviousKeys) {
  const [ver, secret] = entry.split(':');
  if (ver && secret) {
    LEGACY_KEYS.set(ver, derive32ByteKey(secret));
  }
}

const BLIND_INDEX_KEY = derive32ByteKey(env.blindIndexHmacKey);

/**
 * Argon2id password hashing following OWASP guidelines.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string, candidate: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, candidate);
  } catch {
    return false;
  }
}

/**
 * Authenticated AES-256-GCM field-level encryption with key versioning & rotation support.
 * Format: version:iv_b64:authTag_b64:ciphertext_b64
 */
export function encryptField(plaintext: string): string {
  if (!plaintext) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', PRIMARY_AES_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${CURRENT_KEY_VERSION}:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptField(payload: string): string {
  if (!payload) return '';
  const parts = payload.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted field envelope');
  }
  const [version, ivB64, tagB64, ctB64] = parts;
  const key = version === CURRENT_KEY_VERSION ? PRIMARY_AES_KEY : LEGACY_KEYS.get(version);
  if (!key) {
    throw new Error(`Unknown encryption key version: ${version}`);
  }
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/**
 * Keyed HMAC-SHA256 blind index for exact-match lookups on encrypted fields (e.g. email).
 */
export function computeBlindIndex(value: string): string {
  const normalized = value.trim().toLowerCase();
  return crypto.createHmac('sha256', BLIND_INDEX_KEY).update(normalized, 'utf8').digest('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * TOTP Two-Factor Authentication helpers (RFC 6238).
 */
export function createTotpSecret(labelEmail: string) {
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: 'BondAI',
    label: labelEmail,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });
  return {
    base32: secret.base32,
    otpauthUri: totp.toString(),
  };
}

export async function generateQrDataUrl(otpauthUri: string): Promise<string> {
  return QRCode.toDataURL(otpauthUri, { width: 220, margin: 1 });
}

export function verifyTotpCode(base32Secret: string, code: string): boolean {
  const sanitized = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(sanitized)) return false;
  const totp = new OTPAuth.TOTP({
    issuer: 'BondAI',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(base32Secret),
  });
  const delta = totp.validate({ token: sanitized, window: 1 });
  return delta !== null;
}

/**
 * Magic-byte file validation and content inspection to prevent disguised executables or SVG/HTML XSS uploads.
 */
export interface ValidatedMedia {
  mimeType: string;
  extension: string;
}

export function validateMediaBuffer(buf: Buffer, kind: 'image' | 'audio' | 'encrypted'): ValidatedMedia {
  if (!buf || buf.length < 12) {
    throw new Error('File is empty or corrupted');
  }
  if (kind === 'encrypted') {
    // Opaque ciphertext blob for E2EE attachments (cannot be parsed as executable/image on server)
    if (buf.length > 12 * 1024 * 1024) {
      throw new Error('Encrypted attachment exceeds 12MB limit');
    }
    return { mimeType: 'application/octet-stream', extension: 'enc' };
  }

  // Reject HTML/SVG/Script payloads disguised as media
  const headText = buf.subarray(0, Math.min(256, buf.length)).toString('utf8').toLowerCase();
  if (headText.includes('<svg') || headText.includes('<script') || headText.includes('<!doctype')) {
    throw new Error('Active markup files are prohibited');
  }

  if (kind === 'image') {
    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return { mimeType: 'image/jpeg', extension: 'jpg' };
    }
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a
    ) {
      return { mimeType: 'image/png', extension: 'png' };
    }
    // WebP: RIFF....WEBP
    if (
      buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buf.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return { mimeType: 'image/webp', extension: 'webp' };
    }
    throw new Error('Unsupported image signature. Allowed: JPEG, PNG, WebP');
  }

  // Audio magic bytes: WebM (1A 45 DF A3), Ogg (OggS), MP4/M4A (ftyp), WAV (RIFF....WAVE)
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return { mimeType: 'audio/webm', extension: 'webm' };
  }
  if (buf.subarray(0, 4).toString('ascii') === 'OggS') {
    return { mimeType: 'audio/ogg', extension: 'ogg' };
  }
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    return { mimeType: 'audio/mp4', extension: 'm4a' };
  }
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WAVE'
  ) {
    return { mimeType: 'audio/wav', extension: 'wav' };
  }
  throw new Error('Unsupported audio signature. Allowed: WebM, Ogg, M4A, WAV');
}

export function resolveSafeStoragePath(baseDir: string, filename: string): string {
  const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safeName || safeName !== filename) {
    throw new Error('Invalid storage filename');
  }
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, safeName);
  if (!resolvedTarget.startsWith(resolvedBase + path.sep)) {
    throw new Error('Path traversal blocked');
  }
  return resolvedTarget;
}
