# BondAI

**Real Connections. Intelligent Matches. Private by Design.**

BondAI is a privacy-first adult (18+) AI dating web application and Progressive Web App combining explainable personality-based compatibility scoring, consent-gated Blind Connect photo reveal, server-side Gemini AI insights, and end-to-end encrypted private messaging via the Signal Protocol.

## Core Architecture & Features

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Framer Motion (`motion`), Lucide React, Vite PWA (`vite-plugin-pwa`).
- **Backend**: Node.js, Express 4, Socket.IO, Helmet CSP, Zod validation, tiered rate limiting.
- **Database & Persistence**:
  - Persistent disk storage (`node:sqlite` at `data/bondai.db`) in local/single-node runtime with full MongoDB Atlas Mongoose schemas (`server/db/mongooseModels.ts`) ready when `MONGODB_URI` is configured.
  - Redis (`ioredis`) rate-limit & presence store with automatic in-memory TTL fallback when `REDIS_URL` is unset.
- **Authentication & Encryption**:
  - Argon2id password hashing (`argon2`), HTTP-only JWT access cookies (`15m`) + rotating refresh tokens (`7d`) with reuse revocation.
  - Optional TOTP 2FA (`otpauth` + QR code); **mandatory MFA** enforced for all Admin operations.
  - AES-256-GCM authenticated field-level encryption with versioned key rotation (`FIELD_ENCRYPTION_PREVIOUS_KEYS`) + HMAC-SHA256 blind indexes for email lookups.
  - Audited Signal Protocol (`@privacyresearch/libsignal-protocol-typescript`) X3DH + Double Ratchet on-device E2EE messaging, Safety Numbers, identity-key change alerts, and WebCrypto AES-256-GCM encrypted chat attachments.
- **All 26 Routes**: Landing (`/`), Login, Register (18+ enforcement), Verify Email, Forgot/Reset Password, Onboarding, 22-Question Personality Assessment, Discover, Profile Details, Compatibility Report, Matches, Blind Connect, Encrypted Messages, AI Date Planner, Compatibility Games, Notifications, Edit Profile, Account Settings, Privacy Dashboard, Safety Center, Admin Governance Console, Privacy Policy, Terms of Service, Community Guidelines, Support, and Custom 404.

## Folder Structure

```text
├── server.ts                       # Production/Dev HTTP + Socket.IO + Vite server entry
├── server/
│   ├── app.ts                      # Express app factory (Helmet, CORS, CSRF, routes)
│   ├── config/env.ts               # Fail-closed production secret loader
│   ├── db/
│   │   ├── store.ts                # Persistent SQLite store + optional Mongo connection + dev-only seeding
│   │   ├── mongooseModels.ts       # 19 indexed Mongoose schemas for MongoDB Atlas
│   │   └── redis.ts                # ioredis client + TTL fallback
│   ├── middleware/
│   │   ├── auth.ts                 # JWT cookies, CSRF check, requireAuth, requireAdmin (MFA-gated)
│   │   └── rateLimit.ts            # Auth, API, and daily AI quota limiters
│   ├── realtime/socket.ts          # Authenticated Socket.IO presence, typing, read receipts
│   ├── routes/                     # Modular API routers (auth, profiles, discovery, e2ee, blindConnect, ai, games, safety, admin)
│   ├── security/crypto.ts          # Argon2id, AES-256-GCM, blind index, TOTP, magic-byte file validator
│   └── services/
│       ├── matching.ts             # Explainable compatibility scoring engine
│       └── gemini.ts               # Server-only @google/genai wrapper (PII stripped + prompt guard)
├── shared/questionnaire.ts         # Shared 22-question personality/values dataset
├── src/
│   ├── crypto/                     # Signal Protocol IndexedDB store + X3DH/Double Ratchet client
│   ├── context/AuthContext.tsx     # In-memory JWT + cookie session + Signal bootstrap + Socket.IO
│   ├── components/                 # AppShell layout & PWA install/offline controls
│   ├── pages/                      # All 26 UI views
│   └── App.tsx                     # SPA router & route guards
├── tests/securityAndApi.test.ts    # Vitest + Supertest security, crypto, matching & E2EE test suite
├── docs/                           # Threat model, security/privacy architecture, API docs, deployment guide
├── Dockerfile & docker-compose.yml # Cloud Run & Docker deployment config
```

## Local Setup & Commands

```bash
npm install
cp .env.example .env
# Generate 32-byte hex keys for JWT_ACCESS_SECRET, JWT_REFRESH_SECRET,
# FIELD_ENCRYPTION_MASTER_KEY, and BLIND_INDEX_HMAC_KEY before production!
npm run dev      # Starts Express + Socket.IO + Vite on http://localhost:3000
npm test         # Runs Vitest + Supertest security, crypto & API integration tests
npm run lint     # Type-checks TypeScript across client & server
npm run build    # Builds Vite production bundle + PWA service worker into dist/
npm start        # Runs production server (requires persistent secrets in env)
```

## Further Documentation

- `docs/THREAT_MODEL.md` — Mitigations & residual risks
- `docs/SECURITY_ARCHITECTURE.md` — Cryptographic primitives & key lifecycle
- `docs/PRIVACY_ARCHITECTURE.md` — Zero-access E2EE & DPDP Act 2023 compliance design
- `docs/API_DOCS.md` — Complete REST & Socket.IO specification
- `docs/DEPLOYMENT.md` — MongoDB Atlas, Redis, Cloud KMS, Cloud Run & launch checklist
