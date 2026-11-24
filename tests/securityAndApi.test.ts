import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  Direction,
  FingerprintGenerator,
  KeyHelper,
  SessionBuilder,
  SessionCipher,
  SignalProtocolAddress,
  type StorageType,
} from '@privacyresearch/libsignal-protocol-typescript';
import * as OTPAuth from 'otpauth';

// Isolate test database & configure deterministic test encryption secrets BEFORE importing app/db
const tempDbPath = path.join(os.tmpdir(), `bondai-test-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
process.env.BONDAI_DB_FILE = tempDbPath;
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.JWT_REFRESH_SECRET = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
process.env.FIELD_ENCRYPTION_MASTER_KEY = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
process.env.FIELD_ENCRYPTION_PREVIOUS_KEYS =
  'v0:111122223333444455556666777788889999aaaabbbbccccddddeeeeffff0000';
process.env.BLIND_INDEX_HMAC_KEY = '9999888877776666555544443333222211110000ffffeeeeddddccccbbbbaaaa';
process.env.GEMINI_API_KEY = '';

const { createApp } = await import('../server/app.ts');
const { db } = await import('../server/db/store.ts');
const {
  computeBlindIndex,
  decryptField,
  encryptField,
  hashPassword,
  validateMediaBuffer,
  verifyPassword,
} = await import('../server/security/crypto.ts');

const app = createApp();
const CSRF_HEADER = { 'X-Requested-With': 'BondAI-Client' };

interface MemSignalStore extends StorageType {
  put: (key: string, value: unknown) => Promise<void>;
  get: (key: string, defaultValue: unknown) => Promise<unknown>;
  remove: (key: string) => Promise<void>;
  removeSession: (encodedAddress: string) => Promise<void>;
  removeAllSessions: () => Promise<void>;
}

function createMemorySignalStore(): MemSignalStore {
  const store = new Map<string, unknown>();
  return {
    getIdentityKeyPair: async () => store.get('identityKey') as Awaited<ReturnType<StorageType['getIdentityKeyPair']>>,
    getLocalRegistrationId: async () => store.get('registrationId') as number | undefined,
    put: async (key: string, value: unknown) => {
      store.set(key, value);
    },
    get: async (key: string, defaultValue: unknown) => (store.has(key) ? store.get(key) : defaultValue),
    remove: async (key: string) => {
      store.delete(key);
    },
    isTrustedIdentity: async (identifier: string, identityKey: ArrayBuffer, _direction: Direction) => {
      const existing = store.get(`identity_${identifier}`) as ArrayBuffer | undefined;
      if (!existing) return true;
      const a = new Uint8Array(existing);
      const b = new Uint8Array(identityKey);
      return a.length === b.length && a.every((v, i) => v === b[i]);
    },
    saveIdentity: async (encodedAddress: string, publicKey: ArrayBuffer) => {
      const prev = store.get(`identity_${encodedAddress}`) as ArrayBuffer | undefined;
      store.set(`identity_${encodedAddress}`, publicKey);
      if (!prev) return false;
      const a = new Uint8Array(prev);
      const b = new Uint8Array(publicKey);
      return !(a.length === b.length && a.every((v, i) => v === b[i]));
    },
    loadPreKey: async (keyId: number | string) => store.get(`25519KeypreKey${keyId}`) as never,
    storePreKey: async (keyId: number | string, keyPair: unknown) => {
      store.set(`25519KeypreKey${keyId}`, keyPair);
    },
    removePreKey: async (keyId: number | string) => {
      store.delete(`25519KeypreKey${keyId}`);
    },
    loadSignedPreKey: async (keyId: number | string) => store.get(`25519KeysignedKey${keyId}`) as never,
    storeSignedPreKey: async (keyId: number | string, keyPair: unknown) => {
      store.set(`25519KeysignedKey${keyId}`, keyPair);
    },
    removeSignedPreKey: async (keyId: number | string) => {
      store.delete(`25519KeysignedKey${keyId}`);
    },
    loadSession: async (encodedAddress: string) => store.get(`session${encodedAddress}`) as string | undefined,
    storeSession: async (encodedAddress: string, record: string) => {
      store.set(`session${encodedAddress}`, record);
    },
    removeSession: async (encodedAddress: string) => {
      store.delete(`session${encodedAddress}`);
    },
    removeAllSessions: async () => {},
  };
}

const abToB64 = (buf: ArrayBuffer) => Buffer.from(buf).toString('base64');
const b64ToAb = (b64: string) => {
  const buf = Buffer.from(b64, 'base64');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};
const binStrToB64 = (s: string) => Buffer.from(s, 'binary').toString('base64');
const b64ToBinStr = (b64: string) => Buffer.from(b64, 'base64').toString('binary');

async function registerVerifyAndLogin(params: {
  name: string;
  email: string;
  password: string;
  dob: string;
}) {
  const reg = await request(app).post('/api/auth/register').set(CSRF_HEADER).send({
    name: params.name,
    email: params.email,
    password: params.password,
    dateOfBirth: params.dob,
    acceptTerms: true,
    acceptGuidelines: true,
  });
  expect(reg.status).toBe(201);
  const token = reg.body.verificationTokenPreview as string;
  expect(token).toBeTruthy();

  const ver = await request(app).post('/api/auth/verify-email').set(CSRF_HEADER).send({ token });
  expect(ver.status).toBe(200);

  // Verification token must be strictly single-use
  const replay = await request(app).post('/api/auth/verify-email').set(CSRF_HEADER).send({ token });
  expect(replay.status).toBe(400);

  const login = await request(app)
    .post('/api/auth/login')
    .set(CSRF_HEADER)
    .send({ email: params.email, password: params.password });
  expect(login.status).toBe(200);
  expect(login.body.accessToken).toBeTruthy();

  return {
    userId: reg.body.userId as string,
    accessToken: login.body.accessToken as string,
    cookies: login.headers['set-cookie'] as unknown as string[],
  };
}

describe('BondAI Security, Cryptography, Matching, Blind Connect & E2EE Suite', () => {
  beforeAll(() => {
    expect(fs.existsSync(tempDbPath)).toBe(true);
  });

  afterAll(() => {
    try {
      db.close();
    } catch {
      // ignore
    }
    for (const suffix of ['', '-wal', '-shm']) {
      const f = `${tempDbPath}${suffix}`;
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  });

  it('verifies Argon2id hashing, AES-256-GCM field encryption, key rotation, blind index & file magic bytes', async () => {
    const hash = await hashPassword('CorrectHorseBattery99');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 'CorrectHorseBattery99')).toBe(true);
    expect(await verifyPassword(hash, 'WrongPassword99')).toBe(false);

    const enc = encryptField('alice@example.com');
    expect(enc.startsWith('v1:')).toBe(true);
    expect(enc).not.toContain('alice@example.com');
    expect(decryptField(enc)).toBe('alice@example.com');

    // Simulate legacy v0 key rotation decryption
    const cryptoNode = await import('node:crypto');
    const v0Key = Buffer.from('111122223333444455556666777788889999aaaabbbbccccddddeeeeffff0000', 'hex');
    const iv = cryptoNode.randomBytes(12);
    const cipher = cryptoNode.createCipheriv('aes-256-gcm', v0Key, iv);
    const ct = Buffer.concat([cipher.update('Legacy Secret', 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const v0Ciphertext = `v0:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
    expect(decryptField(v0Ciphertext)).toBe('Legacy Secret');

    // Blind index consistency
    expect(computeBlindIndex(' Alice@Example.COM ')).toBe(computeBlindIndex('alice@example.com'));

    // Reject SVG XSS upload even if disguised, allow valid PNG header
    const svgPayload = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(() => validateMediaBuffer(svgPayload, 'image')).toThrow();

    const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    expect(validateMediaBuffer(validPng, 'image')).toEqual({ mimeType: 'image/png', extension: 'png' });
  });

  it('rejects underage (<18) signups, unauthenticated access, CSRF omission & injection payloads', async () => {
    const minorDob = `${new Date().getUTCFullYear() - 16}-05-15`;
    const underageRes = await request(app).post('/api/auth/register').set(CSRF_HEADER).send({
      name: 'Young User',
      email: 'minor@example.com',
      password: 'ValidPassword123',
      dateOfBirth: minorDob,
      acceptTerms: true,
      acceptGuidelines: true,
    });
    expect(underageRes.status).toBe(403);

    // NoSQL operator object injection rejected cleanly by Zod (400)
    const injectionRes = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .send({ email: { $gt: '' }, password: 'Password1234' });
    expect(injectionRes.status).toBe(400);

    // Unauthorized access to protected endpoints returns 401
    const unauthRes = await request(app).get('/api/discovery');
    expect(unauthRes.status).toBe(401);

    // Cross-site cookie-authenticated mutating request without CSRF header or trusted origin returns 403
    const csrfBlocked = await request(app)
      .post('/api/auth/forgot-password')
      .set('Cookie', 'bondai_access=forged_cookie_session')
      .set('Origin', 'https://evil.attacker.example')
      .send({ email: 'a@b.com' });
    expect(csrfBlocked.status).toBe(403);
  });

  it('enforces brute-force account lockout and single-use password reset with session revocation', { timeout: 25000 }, async () => {
    const user = await registerVerifyAndLogin({
      name: 'Lockout Tester',
      email: 'lockout@example.com',
      password: 'StrongPassword123',
      dob: '1994-03-10',
    });

    for (let i = 0; i < 5; i++) {
      const bad = await request(app)
        .post('/api/auth/login')
        .set(CSRF_HEADER)
        .send({ email: 'lockout@example.com', password: 'WrongPassword123' });
      expect(bad.status).toBe(401);
    }

    const locked = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .send({ email: 'lockout@example.com', password: 'StrongPassword123' });
    expect(locked.status).toBe(423);

    // Password reset restores login capability & revokes old sessions
    const forgot = await request(app)
      .post('/api/auth/forgot-password')
      .set(CSRF_HEADER)
      .send({ email: 'lockout@example.com' });
    expect(forgot.status).toBe(200);
    const resetToken = forgot.body.resetTokenPreview as string;
    expect(resetToken).toBeTruthy();

    const reset = await request(app)
      .post('/api/auth/reset-password')
      .set(CSRF_HEADER)
      .send({ token: resetToken, newPassword: 'NewStrongPassword456' });
    expect(reset.status).toBe(200);

    // Replay of reset token fails
    const resetReplay = await request(app)
      .post('/api/auth/reset-password')
      .set(CSRF_HEADER)
      .send({ token: resetToken, newPassword: 'AnotherPassword789' });
    expect(resetReplay.status).toBe(400);

    // Prior session token is invalidated after password reset
    const staleMe = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(staleMe.status).toBe(401);
  });

  it('runs full two-user Blind Connect, compatibility, Signal Protocol E2EE & authorization checks', { timeout: 25000 }, async () => {
    const alice = await registerVerifyAndLogin({
      name: 'Alice Verma',
      email: 'alice.e2ee@example.com',
      password: 'AlicePassword123',
      dob: '1995-07-20',
    });
    const bob = await registerVerifyAndLogin({
      name: 'Bob Kapoor',
      email: 'bob.e2ee@example.com',
      password: 'BobPassword123',
      dob: '1993-11-11',
    });
    const charlie = await registerVerifyAndLogin({
      name: 'Charlie Intruder',
      email: 'charlie@example.com',
      password: 'CharliePassword123',
      dob: '1992-01-15',
    });

    // Update profiles, preferences, and assessments
    await request(app)
      .put('/api/profiles/me')
      .set(CSRF_HEADER)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({
        displayName: 'Alice',
        gender: 'Woman',
        cityRegion: 'Bengaluru',
        interests: ['Coffee', 'Architecture', 'Reading', 'Hiking'],
        relationshipGoal: 'Long-term relationship',
        blindConnectEnabled: true,
      });

    await request(app)
      .put('/api/profiles/preferences')
      .set(CSRF_HEADER)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ minAge: 24, maxAge: 40, preferredGenders: ['Man', 'Everyone'] });

    await request(app)
      .put('/api/profiles/me')
      .set(CSRF_HEADER)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({
        displayName: 'Bob',
        gender: 'Man',
        cityRegion: 'Bengaluru',
        interests: ['Coffee', 'Photography', 'Reading', 'Cycling'],
        relationshipGoal: 'Long-term relationship',
        blindConnectEnabled: true,
      });

    await request(app)
      .put('/api/profiles/preferences')
      .set(CSRF_HEADER)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ minAge: 24, maxAge: 40, preferredGenders: ['Woman', 'Everyone'] });

    // Alice uploads a PNG photo
    const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const uploadRes = await request(app)
      .post('/api/profiles/media/photo')
      .set(CSRF_HEADER)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .attach('photo', pngBuf, 'alice.png');
    expect(uploadRes.status).toBe(201);
    const alicePhotoUrl = uploadRes.body.photo.url as string;

    // Blind discovery returns Bob with photosHidden = true
    const discRes = await request(app)
      .get('/api/discovery?mode=blind')
      .set('Authorization', `Bearer ${alice.accessToken}`);
    expect(discRes.status).toBe(200);
    expect(discRes.body.candidates.some((c: { userId: string }) => c.userId === bob.userId)).toBe(true);

    // Compatibility without AI consent works deterministically (usedAi = false)
    const compatRes = await request(app)
      .get(`/api/ai/compatibility/${bob.userId}`)
      .set('Authorization', `Bearer ${alice.accessToken}`);
    expect(compatRes.status).toBe(200);
    expect(compatRes.body.usedAi).toBe(false);
    expect(compatRes.body.compatibility.overallScore).toBeGreaterThanOrEqual(40);

    // Blind Connect mutual swipe creates 1 match
    const swipe1 = await request(app)
      .post('/api/discovery/swipe')
      .set(CSRF_HEADER)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ targetId: bob.userId, action: 'like', mode: 'blind' });
    expect(swipe1.status).toBe(200);
    expect(swipe1.body.matched).toBe(false);

    const swipe2 = await request(app)
      .post('/api/discovery/swipe')
      .set(CSRF_HEADER)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ targetId: alice.userId, action: 'like', mode: 'blind' });
    expect(swipe2.status).toBe(200);
    expect(swipe2.body.matched).toBe(true);
    const matchId = swipe2.body.match.id as string;

    // Blind Connect enforces HTTP 403 on Alice's photo until BOTH consent
    const hiddenPhotoBefore = await request(app)
      .get(alicePhotoUrl)
      .set('Authorization', `Bearer ${bob.accessToken}`);
    expect(hiddenPhotoBefore.status).toBe(403);

    const rev1 = await request(app)
      .post(`/api/blind-connect/${matchId}/reveal`)
      .set(CSRF_HEADER)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ action: 'approve' });
    expect(rev1.status).toBe(200);
    expect(rev1.body.photosRevealed).toBe(false);

    // Still 403 after single-sided approval
    const hiddenPhotoPartial = await request(app)
      .get(alicePhotoUrl)
      .set('Authorization', `Bearer ${bob.accessToken}`);
    expect(hiddenPhotoPartial.status).toBe(403);

    const rev2 = await request(app)
      .post(`/api/blind-connect/${matchId}/reveal`)
      .set(CSRF_HEADER)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ action: 'approve' });
    expect(rev2.status).toBe(200);
    expect(rev2.body.photosRevealed).toBe(true);

    // Now Bob can view Alice's photo (200)
    const revealedPhoto = await request(app)
      .get(alicePhotoUrl)
      .set('Authorization', `Bearer ${bob.accessToken}`);
    expect(revealedPhoto.status).toBe(200);

    // Genuine Signal Protocol X3DH + Double Ratchet E2EE setup for Alice and Bob
    const aliceStore = createMemorySignalStore();
    const bobStore = createMemorySignalStore();

    const setupSignalIdentity = async (store: MemSignalStore, accessToken: string, deviceId: number) => {
      const regId = KeyHelper.generateRegistrationId();
      const idPair = await KeyHelper.generateIdentityKeyPair();
      const signed = await KeyHelper.generateSignedPreKey(idPair, 1);
      const otp = await KeyHelper.generatePreKey(1);
      await store.put('identityKey', idPair);
      await store.put('registrationId', regId);
      await store.storeSignedPreKey(1, signed.keyPair);
      await store.storePreKey(1, otp.keyPair);

      const res = await request(app)
        .post('/api/e2ee/devices')
        .set(CSRF_HEADER)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          deviceId,
          deviceLabel: 'Vitest Client',
          registrationId: regId,
          identityKeyB64: abToB64(idPair.pubKey),
          signedPreKey: {
            keyId: signed.keyId,
            publicKeyB64: abToB64(signed.keyPair.pubKey),
            signatureB64: abToB64(signed.signature),
          },
          oneTimePreKeys: [{ keyId: otp.keyId, publicKeyB64: abToB64(otp.keyPair.pubKey) }],
        });
      expect(res.status).toBe(201);
      return idPair;
    };

    const aliceIdPair = await setupSignalIdentity(aliceStore, alice.accessToken, 101);
    const bobIdPair = await setupSignalIdentity(bobStore, bob.accessToken, 202);

    // Charlie (unmatched third user) must be blocked from Bob's bundles and Alice-Bob chat
    const charlieBundleForbidden = await request(app)
      .get(`/api/e2ee/bundles/${bob.userId}`)
      .set('Authorization', `Bearer ${charlie.accessToken}`);
    expect(charlieBundleForbidden.status).toBe(403);

    const charlieMsgForbidden = await request(app)
      .get(`/api/e2ee/conversations/${matchId}/messages`)
      .set('Authorization', `Bearer ${charlie.accessToken}`);
    expect(charlieMsgForbidden.status).toBe(403);

    // Alice fetches Bob's public bundle & encrypts plaintext locally with Signal SessionBuilder
    const bobBundleRes = await request(app)
      .get(`/api/e2ee/bundles/${bob.userId}`)
      .set('Authorization', `Bearer ${alice.accessToken}`);
    expect(bobBundleRes.status).toBe(200);
    const bobBundle = bobBundleRes.body.bundles[0];

    const bobAddr = new SignalProtocolAddress(bob.userId, bobBundle.deviceId);
    await new SessionBuilder(aliceStore, bobAddr).processPreKey({
      registrationId: bobBundle.registrationId,
      identityKey: b64ToAb(bobBundle.identityKeyB64),
      signedPreKey: {
        keyId: bobBundle.signedPreKey.keyId,
        publicKey: b64ToAb(bobBundle.signedPreKey.publicKeyB64),
        signature: b64ToAb(bobBundle.signedPreKey.signatureB64),
      },
      preKey: {
        keyId: bobBundle.oneTimePreKey.keyId,
        publicKey: b64ToAb(bobBundle.oneTimePreKey.publicKeyB64),
      },
    });

    const plaintextPayload = JSON.stringify({ kind: 'text', text: 'Zero-access secret dinner invite!' });
    const ciphertext = await new SessionCipher(aliceStore, bobAddr).encrypt(
      new TextEncoder().encode(plaintextPayload).buffer
    );
    const ciphertextB64 = binStrToB64(ciphertext.body || '');

    // Verify Safety Numbers match identically on Alice and Bob
    const fpGen = new FingerprintGenerator(5200);
    const aliceSafetyNum = await fpGen.createFor(alice.userId, aliceIdPair.pubKey, bob.userId, bobIdPair.pubKey);
    const bobSafetyNum = await fpGen.createFor(bob.userId, bobIdPair.pubKey, alice.userId, aliceIdPair.pubKey);
    expect(aliceSafetyNum).toBe(bobSafetyNum);
    expect(aliceSafetyNum.length).toBeGreaterThanOrEqual(60);

    // Alice posts encrypted envelope
    const postMsg = await request(app)
      .post(`/api/e2ee/conversations/${matchId}/messages`)
      .set(CSRF_HEADER)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({
        clientMsgId: 'msg-test-e2ee-1',
        senderDeviceId: 101,
        envelopes: [
          {
            recipientId: bob.userId,
            recipientDeviceId: bobBundle.deviceId,
            signalType: ciphertext.type,
            ciphertextB64,
          },
        ],
      });
    expect(postMsg.status).toBe(201);

    // Verify server DB does NOT contain plaintext
    const dbMsg = db
      .prepare('SELECT ciphertext_b64 FROM encrypted_messages WHERE client_msg_id = ?')
      .get('msg-test-e2ee-1') as { ciphertext_b64: string };
    expect(dbMsg.ciphertext_b64).toBe(ciphertextB64);
    expect(Buffer.from(dbMsg.ciphertext_b64, 'base64').toString('utf8')).not.toContain(
      'Zero-access secret dinner invite!'
    );

    // Bob fetches & decrypts ciphertext using his Signal SessionCipher
    const bobMsgsRes = await request(app)
      .get(`/api/e2ee/conversations/${matchId}/messages?deviceId=${bobBundle.deviceId}`)
      .set('Authorization', `Bearer ${bob.accessToken}`);
    expect(bobMsgsRes.status).toBe(200);
    expect(bobMsgsRes.body.messages.length).toBe(1);

    const aliceAddr = new SignalProtocolAddress(alice.userId, 101);
    const bobCipher = new SessionCipher(bobStore, aliceAddr);
    const decryptedAb = await bobCipher.decryptPreKeyWhisperMessage(
      b64ToBinStr(bobMsgsRes.body.messages[0].ciphertextB64),
      'binary'
    );
    const decryptedText = new TextDecoder().decode(decryptedAb);
    expect(JSON.parse(decryptedText).text).toBe('Zero-access secret dinner invite!');

    // Blocking Bob prevents Bob from messaging or accessing Alice's photo
    const blockRes = await request(app)
      .post(`/api/safety/block/${bob.userId}`)
      .set(CSRF_HEADER)
      .set('Authorization', `Bearer ${alice.accessToken}`);
    expect(blockRes.status).toBe(200);

    const blockedPhoto = await request(app)
      .get(alicePhotoUrl)
      .set('Authorization', `Bearer ${bob.accessToken}`);
    expect(blockedPhoto.status).toBe(403);
  });

  it('enforces Admin Claim, mandatory TOTP MFA on Admin endpoints, and permanent account deletion', async () => {
    const adminCandidate = await registerVerifyAndLogin({
      name: 'Admin Member',
      email: 'admin.test@example.com',
      password: 'AdminPassword123',
      dob: '1988-09-01',
    });

    // Normal user denied admin overview
    const deniedBefore = await request(app)
      .get('/api/admin/overview')
      .set('Authorization', `Bearer ${adminCandidate.accessToken}`);
    expect(deniedBefore.status).toBe(403);

    // Claim admin first-run
    const claimRes = await request(app)
      .post('/api/admin/claim')
      .set(CSRF_HEADER)
      .set('Authorization', `Bearer ${adminCandidate.accessToken}`)
      .send({ passcode: 'SuperSecurePasscode99' });
    expect(claimRes.status).toBe(200);
    expect(claimRes.body.requiresMfaVerification).toBe(true);
    const secret = claimRes.body.totpSetup.secret as string;

    // Admin STILL denied overview until TOTP MFA is verified
    const deniedWithoutMfa = await request(app)
      .get('/api/admin/overview')
      .set('Authorization', `Bearer ${claimRes.body.accessToken}`);
    expect(deniedWithoutMfa.status).toBe(403);

    // Verify real TOTP code generated from secret
    const totp = new OTPAuth.TOTP({
      issuer: 'BondAI',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    const mfaRes = await request(app)
      .post('/api/admin/verify-mfa')
      .set(CSRF_HEADER)
      .set('Authorization', `Bearer ${claimRes.body.accessToken}`)
      .send({ code: totp.generate() });
    expect(mfaRes.status).toBe(200);
    expect(mfaRes.body.mfaVerified).toBe(true);

    // MFA-verified admin accesses overview
    const allowedOverview = await request(app)
      .get('/api/admin/overview')
      .set('Authorization', `Bearer ${mfaRes.body.accessToken}`);
    expect(allowedOverview.status).toBe(200);
    expect(allowedOverview.body.stats.totalUsers).toBeGreaterThan(0);

    // Permanent account deletion purges account
    const delRes = await request(app)
      .delete('/api/safety/account')
      .set(CSRF_HEADER)
      .set('Authorization', `Bearer ${mfaRes.body.accessToken}`);
    expect(delRes.status).toBe(200);

    const checkDeleted = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${mfaRes.body.accessToken}`);
    expect(checkDeleted.status).toBe(401);
  });
});
