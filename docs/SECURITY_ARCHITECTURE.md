# BondAI Security Architecture

## 1. Authentication & Session Model
- **Password Hashing**: `argon2` (`argon2.argon2id`) with per-user cryptographically random salts. Passwords require minimum 10 characters (`z.string().min(10).max(128)`).
- **Token Architecture**:
  - **Access Token**: Short-lived JWT (`15m`) containing `sub`, `role`, `sessionId`, `mfaVerified`, `emailVerified`. Stored in React ref memory on the client and in an `HttpOnly` cookie (`bondai_access`).
  - **Refresh Token**: Rotating JWT (`7d`) with unique `tokenId` hashed via SHA-256 into `user_sessions.refresh_token_hash`. Refresh reuse detection detects stale/replayed refresh tokens and revokes **all** sessions for that account.
- **Cookie Flags**: Over HTTPS/iframe previews (`x-forwarded-proto === 'https'`, `req.secure`, or `NODE_ENV === 'production'`), cookies use `HttpOnly; Secure; SameSite=None; Partitioned`. Over plain HTTP localhost, cookies use `HttpOnly; SameSite=Lax`.
- **Two-Factor Authentication**: TOTP (`otpauth` + `qrcode` QR URI) with AES-256-GCM encrypted shared secret in `users.totp_secret_encrypted`. Admin endpoints enforce `mfaVerified === true` via `requireAdmin`.

## 2. Field-Level Encryption & Key Rotation
Implemented in `server/security/crypto.ts`:
- **Authenticated Encryption**: `AES-256-GCM` with 12-byte random IV (`crypto.randomBytes(12)`) per write and 16-byte authentication tag, serialized as `v1:<ivHex>:<tagHex>:<ctHex>`.
- **Key Rotation**: `FIELD_ENCRYPTION_PREVIOUS_KEYS` supports comma-separated `version:hexKey` entries so rotated secrets can decrypt legacy records seamlessly while new writes use the active `v1` master key.
- **Blind Indexing**: Exact-match lookups on encrypted fields (`email`, `password_reset`, `email_verification`) compute `HMAC-SHA256(key, normalizedValue)` using `BLIND_INDEX_HMAC_KEY`.
- **Managed Key Integration**: `GOOGLE_CLOUD_KMS_KEY_NAME` environment configuration is wired for Cloud Run / Cloud KMS envelope wrapping in production.

## 3. Genuine End-to-End Encrypted Messaging (Signal Protocol)
Implemented in `src/crypto/signalStore.ts`, `src/crypto/e2eeClient.ts`, and `server/routes/e2ee.ts`:
- **Protocol**: Audited `@privacyresearch/libsignal-protocol-typescript` implementing X3DH key agreement and Double Ratchet forward secrecy.
- **Device Key Lifecycle**:
  1. Each client browser generates an Identity Key Pair, Registration ID, Signed PreKey (`KeyHelper.generateSignedPreKey`), and 16 One-Time PreKeys (`KeyHelper.generatePreKey`) stored locally in browser `IndexedDB`.
  2. Only public keys and signatures are uploaded to `/api/e2ee/keys/register`.
  3. Senders fetch recipient device prekey bundles from `/api/e2ee/bundles/:targetUserId` (atomically popping one prekey per session initiation) and build per-device Signal `SessionCipher` ciphertexts.
  4. Ciphertexts (`signalType`, `ciphertextB64`) are relayed via Socket.IO & stored encrypted in `messages` (`server` has zero access to plaintext).
- **Encrypted Attachments**: Media sent inside chat is encrypted client-side via WebCrypto `AES-256-GCM` with a random 256-bit file key; the server stores opaque `.enc` blobs, and the file key + IV travel strictly inside the Signal-encrypted envelope.
- **Identity Verification**: 60-digit Safety Numbers computed locally via `FingerprintGenerator(5200)` and automatic identity-key-change banner notifications when a partner registers a new Identity Key.

## 4. Controlled Media & Validation
- **Magic-Byte Inspection**: `validateMediaBuffer()` checks actual file binary signatures (JPEG, PNG, WebP, GIF, MP3/ID3, WebM, OGG, MP4/M4A) and rejects SVG/HTML/XML script payloads regardless of MIME header.
- **Path Traversal Guard**: `resolveSafeStoragePath()` prevents directory escapes when serving or deleting media assets.
- **Blind Connect Enforcement**: `GET /api/profiles/media/:mediaId` verifies active session, block status, and Blind Connect `matches.photos_revealed` status server-side, returning `HTTP 403` when photos are hidden.
