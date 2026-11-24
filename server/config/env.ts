import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const KEYSTORE_DIR = path.resolve(process.cwd(), '.keystore');
const KEYSTORE_FILE = path.join(KEYSTORE_DIR, 'bondai-keys.json');

type ManagedKeyName =
  | 'JWT_ACCESS_SECRET'
  | 'JWT_REFRESH_SECRET'
  | 'FIELD_ENCRYPTION_MASTER_KEY'
  | 'BLIND_INDEX_HMAC_KEY';

let cachedKeystore: Partial<Record<ManagedKeyName, string>> | null = null;

function readKeystore(): Partial<Record<ManagedKeyName, string>> {
  if (cachedKeystore) return cachedKeystore;
  try {
    if (fs.existsSync(KEYSTORE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(KEYSTORE_FILE, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        cachedKeystore = parsed as Partial<Record<ManagedKeyName, string>>;
        return cachedKeystore;
      }
    }
  } catch {
    // Regenerate cleanly if unreadable
  }
  cachedKeystore = {};
  return cachedKeystore;
}

function writeKeystore(next: Partial<Record<ManagedKeyName, string>>) {
  cachedKeystore = next;
  try {
    fs.mkdirSync(KEYSTORE_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(KEYSTORE_FILE, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
  } catch {
    // Ignore read-only filesystem edge cases; in-memory key still remains active for current process
  }
}

function getOrCreateManagedSecret(envKey: ManagedKeyName): string {
  const existing = process.env[envKey];
  if (existing && existing.trim().length >= 32) {
    return existing.trim();
  }

  // Test runners isolate per-process keys unless overridden
  if (process.env.NODE_ENV === 'test') {
    return crypto.randomBytes(32).toString('hex');
  }

  const store = readKeystore();
  const stored = store[envKey];
  if (stored && typeof stored === 'string' && stored.trim().length >= 32) {
    return stored.trim();
  }

  // Auto-generate cryptographically random 256-bit key and persist outside database
  const generated = crypto.randomBytes(32).toString('hex');
  const updated = { ...store, [envKey]: generated };
  writeKeystore(updated);

  if (process.env.NODE_ENV === 'production') {
    console.warn(
      `[BondAI Security Notice] Auto-generated persistent ${envKey} in .keystore. For multi-instance Cloud Run scaling, bind persistent secrets via Secret Manager / KMS.`
    );
  }
  return generated;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 3000),
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  mongodbUri: process.env.MONGODB_URI?.trim() || '',
  redisUrl: process.env.REDIS_URL?.trim() || '',
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() || '',
  jwtAccessSecret: getOrCreateManagedSecret('JWT_ACCESS_SECRET'),
  jwtRefreshSecret: getOrCreateManagedSecret('JWT_REFRESH_SECRET'),
  fieldEncryptionMasterKey: getOrCreateManagedSecret('FIELD_ENCRYPTION_MASTER_KEY'),
  fieldEncryptionPreviousKeys: (process.env.FIELD_ENCRYPTION_PREVIOUS_KEYS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  blindIndexHmacKey: getOrCreateManagedSecret('BLIND_INDEX_HMAC_KEY'),
  googleCloudKmsKeyName: process.env.GOOGLE_CLOUD_KMS_KEY_NAME?.trim() || '',
  adminPasscode: process.env.ADMIN_PASSCODE?.trim() || '',
  enablePublicRegistration: process.env.ENABLE_PUBLIC_REGISTRATION !== 'false',
  enableDevDemoAccounts:
    process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEV_DEMO_ACCOUNTS !== 'false',
  dailySwipeLimit: Math.max(5, Number(process.env.DAILY_SWIPE_LIMIT || 50)),
  aiDailyQuota: Math.max(5, Number(process.env.AI_DAILY_QUOTA || 40)),
};
