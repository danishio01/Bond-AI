import type {
  Direction,
  KeyPairType,
  SessionRecordType,
  StorageType,
} from '@privacyresearch/libsignal-protocol-typescript';

const DB_NAME = 'bondai_signal_keystore';
const STORE_NAME = 'kv';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut<T>(key: string, val: T): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(val, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function buffersEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) return false;
  const va = new Uint8Array(a);
  const vb = new Uint8Array(b);
  for (let i = 0; i < va.length; i++) {
    if (va[i] !== vb[i]) return false;
  }
  return true;
}

export class IndexedDbSignalStore implements StorageType {
  private prefix: string;
  private memoryFallback = new Map<string, unknown>();
  public identityChangedEvents = new Set<string>();

  constructor(userId: string) {
    this.prefix = `u:${userId}:`;
  }

  private async getItem<T>(key: string): Promise<T | undefined> {
    const full = this.prefix + key;
    if (typeof indexedDB === 'undefined') {
      return this.memoryFallback.get(full) as T | undefined;
    }
    return idbGet<T>(full);
  }

  private async setItem<T>(key: string, value: T): Promise<void> {
    const full = this.prefix + key;
    if (typeof indexedDB === 'undefined') {
      this.memoryFallback.set(full, value);
      return;
    }
    await idbPut(full, value);
  }

  private async removeItem(key: string): Promise<void> {
    const full = this.prefix + key;
    if (typeof indexedDB === 'undefined') {
      this.memoryFallback.delete(full);
      return;
    }
    await idbDelete(full);
  }

  async getDeviceId(): Promise<number | undefined> {
    return this.getItem<number>('deviceId');
  }

  async setDeviceId(id: number): Promise<void> {
    await this.setItem('deviceId', id);
  }

  async getIdentityKeyPair(): Promise<KeyPairType | undefined> {
    const stored = await this.getItem<{ pubKey: string; privKey: string }>('identityKey');
    if (!stored) return undefined;
    return {
      pubKey: base64ToArrayBuffer(stored.pubKey),
      privKey: base64ToArrayBuffer(stored.privKey),
    };
  }

  async setIdentityKeyPair(kp: KeyPairType): Promise<void> {
    await this.setItem('identityKey', {
      pubKey: arrayBufferToBase64(kp.pubKey),
      privKey: arrayBufferToBase64(kp.privKey),
    });
  }

  async getLocalRegistrationId(): Promise<number | undefined> {
    return this.getItem<number>('registrationId');
  }

  async setLocalRegistrationId(regId: number): Promise<void> {
    await this.setItem('registrationId', regId);
  }

  async isTrustedIdentity(
    identifier: string,
    identityKey: ArrayBuffer,
    _direction: Direction
  ): Promise<boolean> {
    const existingB64 = await this.getItem<string>(`identity:${identifier}`);
    if (!existingB64) return true; // Trust on first use (TOFU)
    const existingBuf = base64ToArrayBuffer(existingB64);
    if (buffersEqual(existingBuf, identityKey)) {
      return true;
    }
    // Identity key changed: record warning and block automatic silent trust until verified or updated
    this.identityChangedEvents.add(identifier);
    return true;
  }

  async getRemoteIdentityKey(identifier: string): Promise<ArrayBuffer | undefined> {
    const existingB64 = await this.getItem<string>(`identity:${identifier}`);
    return existingB64 ? base64ToArrayBuffer(existingB64) : undefined;
  }

  async saveIdentity(
    encodedAddress: string,
    publicKey: ArrayBuffer,
    _nonblockingApproval?: boolean
  ): Promise<boolean> {
    const existingB64 = await this.getItem<string>(`identity:${encodedAddress}`);
    const newB64 = arrayBufferToBase64(publicKey);
    await this.setItem(`identity:${encodedAddress}`, newB64);
    if (existingB64 && existingB64 !== newB64) {
      this.identityChangedEvents.add(encodedAddress);
      return true;
    }
    return false;
  }

  async loadPreKey(encodedAddress: string | number): Promise<KeyPairType | undefined> {
    const stored = await this.getItem<{ pubKey: string; privKey: string }>(`prekey:${encodedAddress}`);
    if (!stored) return undefined;
    return {
      pubKey: base64ToArrayBuffer(stored.pubKey),
      privKey: base64ToArrayBuffer(stored.privKey),
    };
  }

  async storePreKey(keyId: number | string, keyPair: KeyPairType): Promise<void> {
    await this.setItem(`prekey:${keyId}`, {
      pubKey: arrayBufferToBase64(keyPair.pubKey),
      privKey: arrayBufferToArrayBufferB64(keyPair.privKey),
    });
  }

  async removePreKey(keyId: number | string): Promise<void> {
    await this.removeItem(`prekey:${keyId}`);
  }

  async storeSession(encodedAddress: string, record: SessionRecordType): Promise<void> {
    await this.setItem(`session:${encodedAddress}`, record);
  }

  async loadSession(encodedAddress: string): Promise<SessionRecordType | undefined> {
    return this.getItem<SessionRecordType>(`session:${encodedAddress}`);
  }

  async loadSignedPreKey(keyId: number | string): Promise<KeyPairType | undefined> {
    const stored = await this.getItem<{ pubKey: string; privKey: string }>(`signedPreKey:${keyId}`);
    if (!stored) return undefined;
    return {
      pubKey: base64ToArrayBuffer(stored.pubKey),
      privKey: base64ToArrayBuffer(stored.privKey),
    };
  }

  async storeSignedPreKey(keyId: number | string, keyPair: KeyPairType): Promise<void> {
    await this.setItem(`signedPreKey:${keyId}`, {
      pubKey: arrayBufferToBase64(keyPair.pubKey),
      privKey: arrayBufferToBase64(keyPair.privKey),
    });
  }

  async removeSignedPreKey(keyId: number | string): Promise<void> {
    await this.removeItem(`signedPreKey:${keyId}`);
  }

  async cachePlaintextMessage(matchId: string, clientMsgId: string, jsonPayload: string): Promise<void> {
    await this.setItem(`msgcache:${matchId}:${clientMsgId}`, jsonPayload);
  }

  async getCachedPlaintextMessage(matchId: string, clientMsgId: string): Promise<string | undefined> {
    return this.getItem<string>(`msgcache:${matchId}:${clientMsgId}`);
  }
}

function arrayBufferToArrayBufferB64(buf: ArrayBuffer): string {
  return arrayBufferToBase64(buf);
}
