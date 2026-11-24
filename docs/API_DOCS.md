# BondAI REST & Socket.IO API Reference

All endpoints live under `/api/*`. State-changing requests require the CSRF header `X-Requested-With: BondAI-Client` (and matching `Origin`/`Referer` when supplied) plus HTTP-only session cookies or in-memory `Authorization: Bearer` token.

## Health & Auth (`/api/auth`)
- `GET /api/health` — Database & readiness status (`200 OK`).
- `POST /api/auth/register` — Registers adult (18+) user (`email`, `password`, `name`, `dateOfBirth`). Returns `403` if age < 18.
- `POST /api/auth/verify-email` — Consumes single-use verification token (`{ email, token }`).
- `POST /api/auth/resend-verification` — Issues fresh single-use verification token.
- `POST /api/auth/login` — Authenticates credentials with Argon2id; enforces brute-force lockout & optional TOTP code; sets HTTP-only access/refresh cookies.
- `POST /api/auth/refresh` — Rotates refresh JWT; detects token reuse and revokes all active sessions on replay.
- `POST /api/auth/logout` / `POST /api/auth/logout-all` — Revokes current or all user sessions.
- `POST /api/auth/forgot-password` & `POST /api/auth/reset-password` — Single-use 30-min reset token flow; revokes sessions after password reset.
- `POST /api/auth/change-password` — Verifies current password before Argon2id update.
- `POST /api/auth/2fa/setup`, `/2fa/verify`, `/2fa/disable` — Authenticator TOTP management.
- `GET /api/auth/sessions`, `DELETE /api/auth/sessions/:sessionId` — Active device & session management.
- `GET /api/auth/me` — Returns current authenticated user, profile, preferences, privacy consent, and assessment answers.
- `GET /api/auth/dev-demo-accounts` — Development-only (`404` when `NODE_ENV=production`) fictional `[Demo]` profiles list.

## Profiles & Media (`/api/profiles`)
- `PUT /api/profiles/me` — Updates display profile, relationship goal, interests, prompts, lifestyle, and onboarding step.
- `PUT /api/profiles/preferences` — Updates age/gender filters and compatibility dimension weights.
- `PUT /api/profiles/assessment` — Saves answers to the 22-question compatibility assessment (`shared/questionnaire.ts`).
- `POST /api/profiles/media` — Uploads validated profile image (`jpg/png/webp/gif`, max 5MB) or voice intro (`mp3/webm/ogg/m4a`).
- `DELETE /api/profiles/media/:mediaId` — Deletes owned photo.
- `GET /api/profiles/media/:mediaId` — Controlled private media route; enforces auth, blocklist, and Blind Connect `photos_revealed` check (`403` if hidden).
- `GET /api/profiles/:userId` — Returns visibility-checked full profile for a member.

## Discovery, Matches & Blind Connect (`/api/discovery`, `/api/blind-connect`)
- `GET /api/discovery?mode=standard|blind&minScore=0&goal=...` — Ranked mutual-preference candidates with explainable compatibility breakdown.
- `POST /api/discovery/swipe` — Records `like`, `pass`, or `superlike`; atomically creates mutual match, conversation, and Blind Connect reveal state.
- `POST /api/discovery/undo` — Undoes latest non-matched swipe.
- `GET /api/discovery/matches` — Lists active matches with conversation IDs and reveal status.
- `DELETE /api/discovery/matches/:matchId` — Unmatches active match.
- `POST /api/blind-connect/:matchId/reveal` — Submits `{ action: 'approve' | 'decline' }`; reveals photos only when both partners approve.

## End-to-End Encrypted Messaging (`/api/e2ee`)
- `POST /api/e2ee/keys/register` — Registers Signal Identity Key, Signed PreKey, and One-Time PreKeys for the device; logs identity changes.
- `GET /api/e2ee/devices` & `DELETE /api/e2ee/devices/:deviceId` — Lists or revokes own E2EE devices.
- `GET /api/e2ee/bundles/:targetUserId` — Fetches target user's Signal prekey bundles (atomically pops 1 one-time prekey) + identity-change warning flag.
- `GET /api/e2ee/messages/:matchId` — Returns encrypted message envelopes for verified match participant (`403` otherwise).
- `POST /api/e2ee/messages/:matchId` — Stores opaque Signal ciphertext envelopes (`recipients: [{ recipientId, deviceId, signalType, ciphertextB64 }]`).
- `PATCH /api/e2ee/conversations/:matchId/timer` — Sets disappearing message TTL (`0`, `86400`, `604800`).
- `DELETE /api/e2ee/conversations/:matchId` — Clears encrypted messages for that conversation.
- `POST /api/e2ee/attachments` & `GET /api/e2ee/attachments/:attachmentId` — Stores/serves opaque `.enc` client-encrypted blobs (auth + participant gated).

## AI Features, Games, Safety & Admin
- `GET /api/ai/compatibility/:targetUserId` — Deterministic explainable compatibility report + optional Gemini summary (requires AI consent).
- `POST /api/ai/icebreakers` — Generates personalized icebreakers (requires AI consent or deterministic fallback).
- `POST /api/ai/profile-assistant` — Profile bio clarity feedback.
- `POST /api/ai/date-planner` — Tailored low-pressure first-date itineraries.
- `GET /api/games/:matchId`, `POST /api/games/:matchId/submit`, `POST /api/games/:matchId/reveal` — Compatibility games with mutual reveal.
- `GET /api/safety/notifications`, `POST /api/safety/notifications/read-all`
- `POST /api/safety/reports`, `POST /api/safety/block/:targetUserId`, `DELETE /api/safety/block/:targetUserId`, `GET /api/safety/blocks`
- `GET/PUT /api/safety/privacy`, `GET /api/safety/export`, `POST /api/safety/account/deactivate`, `DELETE /api/safety/account`, `POST /api/safety/support`
- `GET /api/admin/bootstrap-status`, `POST /api/admin/claim`, `POST /api/admin/verify-mfa`
- `GET /api/admin/overview`, `GET /api/admin/reports`, `PATCH /api/admin/reports/:reportId`, `POST /api/admin/users/:userId/unsuspend`, `PUT /api/admin/config/limits`, `GET /api/admin/audit-logs`

## Socket.IO Events (`server/realtime/socket.ts`)
- Client -> Server: `match:join`, `typing:update`, `message:read` (verified against `matches` membership).
- Server -> Client: `match:created`, `e2ee:message`, `blind:reveal-updated`, `presence:status`, `typing:status`, `message:read_receipt`, `e2ee:identity-changed`.
