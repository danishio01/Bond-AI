import {
  FingerprintGenerator,
  KeyHelper,
  SessionBuilder,
  SessionCipher,
  SignalProtocolAddress,
} from '@privacyresearch/libsignal-protocol-typescript';
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  IndexedDbSignalStore,
} from './signalStore';

export interface RemoteDeviceBundle {
  userId: string;
  deviceId: number;
  deviceLabel: string;
  registrationId: number;
  identityKeyB64: string;
  signedPreKey: {
    keyId: number;
    publicKeyB64: string;
    signatureB64: string;
  };
  oneTimePreKey: {
    keyId: number;
    publicKeyB64: string;
  } | null;
}

export interface DecryptedPayload {
  text: string;
  kind: 'text' | 'image' | 'voice';
  attachment?: {
    url: string;
    keyB64: string;
    ivB64: string;
    mimeType: string;
    fileName?: string;
  };
  sentAt: number;
}

export interface EncryptedEnvelopeInput {
  recipientId: string;
  recipientDeviceId: number;
  signalType: number;
  ciphertextB64: string;
}

const storeCache = new Map<string, IndexedDbSignalStore>();

export function getSignalStore(userId: string): IndexedDbSignalStore {
  let s = storeCache.get(userId);
  if (!s) {
    s = new IndexedDbSignalStore(userId);
    storeCache.set(userId, s);
  }
  return s;
}

function binaryStringToBase64(bin: string): string {
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i) & 0xff;
  }
  return arrayBufferToBase64(bytes.buffer);
}

/**
 * Initializes local Signal Protocol identity keys, signed prekey, and 20 one-time prekeys
 * on first launch for this user's browser device, and registers public keys with the server.
 */
export async function ensureDeviceKeysRegistered(
  userId: string,
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>
): Promise<{ deviceId: number; identityKeyB64: string }> {
  const store = getSignalStore(userId);
  let deviceId = await store.getDeviceId();
  let identityKeyPair = await store.getIdentityKeyPair();
  let registrationId = await store.getLocalRegistrationId();

  if (!deviceId || !identityKeyPair || !registrationId) {
    deviceId = 1 + Math.floor(Math.random() * 900000);
    registrationId = KeyHelper.generateRegistrationId();
    identityKeyPair = await KeyHelper.generateIdentityKeyPair();

    await store.setDeviceId(deviceId);
    await store.setLocalRegistrationId(registrationId);
    await store.setIdentityKeyPair(identityKeyPair);

    const signedPreKeyId = 1;
    const signedPreKey = await KeyHelper.generateSignedPreKey(identityKeyPair, signedPreKeyId);
    await store.storeSignedPreKey(signedPreKeyId, signedPreKey.keyPair);

    const oneTimePreKeys: Array<{ keyId: number; publicKeyB64: string }> = [];
    for (let i = 1; i <= 20; i++) {
      const preKey = await KeyHelper.generatePreKey(i);
      await store.storePreKey(i, preKey.keyPair);
      oneTimePreKeys.push({
        keyId: preKey.keyId,
        publicKeyB64: arrayBufferToBase64(preKey.keyPair.pubKey),
      });
    }

    const res = await apiFetch('/api/e2ee/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId,
        deviceLabel: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 48) : 'Web Browser',
        registrationId,
        identityKeyB64: arrayBufferToBase64(identityKeyPair.pubKey),
        signedPreKey: {
          keyId: signedPreKey.keyId,
          publicKeyB64: arrayBufferToBase64(signedPreKey.keyPair.pubKey),
          signatureB64: arrayBufferToBase64(signedPreKey.signature),
        },
        oneTimePreKeys,
      }),
    });
    if (!res.ok) {
      throw new Error('Failed to register Signal device public key bundle');
    }
  }

  return {
    deviceId,
    identityKeyB64: arrayBufferToBase64(identityKeyPair.pubKey),
  };
}

async function ensureSessionWithBundle(
  store: IndexedDbSignalStore,
  bundle: RemoteDeviceBundle
): Promise<SignalProtocolAddress> {
  const address = new SignalProtocolAddress(bundle.userId, bundle.deviceId);
  const cipher = new SessionCipher(store, address);
  const hasSession = await cipher.hasOpenSession();
  if (!hasSession) {
    const builder = new SessionBuilder(store, address);
    await builder.processPreKey({
      registrationId: bundle.registrationId,
      identityKey: base64ToArrayBuffer(bundle.identityKeyB64),
      signedPreKey: {
        keyId: bundle.signedPreKey.keyId,
        publicKey: base64ToArrayBuffer(bundle.signedPreKey.publicKeyB64),
        signature: base64ToArrayBuffer(bundle.signedPreKey.signatureB64),
      },
      ...(bundle.oneTimePreKey
        ? {
            preKey: {
              keyId: bundle.oneTimePreKey.keyId,
              publicKey: base64ToArrayBuffer(bundle.oneTimePreKey.publicKeyB64),
            },
          }
        : {}),
    });
  }
  return address;
}

export async function encryptPayloadForDevices(params: {
  senderId: string;
  matchId: string;
  clientMsgId: string;
  payload: DecryptedPayload;
  targetBundles: RemoteDeviceBundle[];
}): Promise<EncryptedEnvelopeInput[]> {
  const { senderId, matchId, clientMsgId, payload, targetBundles } = params;
  const store = getSignalStore(senderId);
  const jsonText = JSON.stringify(payload);
  await store.cachePlaintextMessage(matchId, clientMsgId, jsonText);

  const plaintextBuf = new TextEncoder().encode(jsonText).buffer;
  const envelopes: EncryptedEnvelopeInput[] = [];

  for (const bundle of targetBundles) {
    const address = await ensureSessionWithBundle(store, bundle);
    const cipher = new SessionCipher(store, address);
    const encrypted = await cipher.encrypt(plaintextBuf);
    if (!encrypted.body) continue;
    envelopes.push({
      recipientId: bundle.userId,
      recipientDeviceId: bundle.deviceId,
      signalType: encrypted.type,
      ciphertextB64: binaryStringToBase64(encrypted.body),
    });
  }

  return envelopes;
}

export async function decryptEnvelope(params: {
  myUserId: string;
  matchId: string;
  clientMsgId: string;
  senderId: string;
  senderDeviceId: number;
  signalType: number;
  ciphertextB64: string;
}): Promise<{ payload: DecryptedPayload | null; identityChanged: boolean }> {
  const { myUserId, matchId, clientMsgId, senderId, senderDeviceId, signalType, ciphertextB64 } =
    params;
  const store = getSignalStore(myUserId);

  // If this device sent the message, return locally cached plaintext from IndexedDB
  if (senderId === myUserId) {
    const cached = await store.getCachedPlaintextMessage(matchId, clientMsgId);
    if (cached) {
      return { payload: JSON.parse(cached) as DecryptedPayload, identityChanged: false };
    }
  }

  const address = new SignalProtocolAddress(senderId, senderDeviceId);
  const cipher = new SessionCipher(store, address);
  const cipherBuf = base64ToArrayBuffer(ciphertextB64);

  try {
    let plaintextBuf: ArrayBuffer;
    if (signalType === 3) {
      plaintextBuf = await cipher.decryptPreKeyWhisperMessage(cipherBuf);
    } else {
      plaintextBuf = await cipher.decryptWhisperMessage(cipherBuf);
    }
    const decoded = new TextDecoder().decode(plaintextBuf);
    const parsed = JSON.parse(decoded) as DecryptedPayload;
    await store.cachePlaintextMessage(matchId, clientMsgId, decoded);
    return {
      payload: parsed,
      identityChanged: store.identityChangedEvents.has(address.toString()),
    };
  } catch {
    // Fallback to local cache if already decrypted previously (Signal ratchet consumes message key once)
    const cached = await store.getCachedPlaintextMessage(matchId, clientMsgId);
    if (cached) {
      return { payload: JSON.parse(cached) as DecryptedPayload, identityChanged: false };
    }
    return { payload: null, identityChanged: store.identityChangedEvents.has(address.toString()) };
  }
}

/**
 * Generates an official Signal numeric Safety Number (60 digits in 12 groups of 5)
 * from local and partner Curve25519 identity public keys.
 */
export async function computeSafetyNumber(
  localUserId: string,
  remoteUserId: string,
  remoteIdentityKeyB64: string
): Promise<string> {
  const store = getSignalStore(localUserId);
  const localIdentity = await store.getIdentityKeyPair();
  if (!localIdentity) return 'Keys not initialized on this device';
  const gen = new FingerprintGenerator(5200);
  const raw = await gen.createFor(
    localUserId,
    localIdentity.pubKey,
    remoteUserId,
    base64ToArrayBuffer(remoteIdentityKeyB64)
  );
  return raw.match(/.{1,5}/g)?.join(' ') || raw;
}

/**
 * Encrypts a binary attachment (image or voice note) on-device using AES-256-GCM
 * before uploading opaque ciphertext bytes to the server.
 */
export async function encryptAttachmentOnDevice(fileBytes: ArrayBuffer): Promise<{
  ciphertextBlob: Blob;
  keyB64: string;
  ivB64: string;
}> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, fileBytes);
  const rawKey = await crypto.subtle.exportKey('raw', key);
  return {
    ciphertextBlob: new Blob([encrypted], { type: 'application/octet-stream' }),
    keyB64: arrayBufferToBase64(rawKey),
    ivB64: arrayBufferToBase64(iv.buffer),
  };
}

export async function decryptAttachmentOnDevice(
  ciphertextBuf: ArrayBuffer,
  keyB64: string,
  ivB64: string,
  mimeType: string
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    base64ToArrayBuffer(keyB64),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(base64ToArrayBuffer(ivB64)) },
    key,
    ciphertextBuf
  );
  const blob = new Blob([decrypted], { type: mimeType });
  return URL.createObjectURL(blob);
}
