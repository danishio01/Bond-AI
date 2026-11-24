# BondAI Privacy Architecture

## 1. Privacy by Design & Data Minimization
BondAI separates cryptographic trust zones so no single compromise exposes private conversations alongside real-world identity:

1. **Zero-Access E2EE Zone (Client Devices Only)**:
   - Private 1:1 messages, voice notes, attachment file keys, and Signal private keys never leave authorized user devices unencrypted.
   - Administrators and support staff cannot inspect message plaintext. Safety moderation relies solely on text/excerpts explicitly pasted and consented to by the reporting member.
2. **Encrypted PII Vault (AES-256-GCM at Rest)**:
   - Legal `name`, `email`, `date_of_birth`, and `totp_secret` are stored encrypted with AES-256-GCM and queried via HMAC-SHA256 blind indexes.
3. **Consent-Gated Discovery Profile**:
   - Approximate region (`cityRegion`) is optional text (no GPS coordinate collection or retention).
   - `shareApproxLocation`, `showOnlineStatus`, `readReceipts`, `discoveryPaused`, `profileVisibility`, and `photoVisibility` are individually toggleable in the Privacy Dashboard (`/privacy`).
4. **Blind Connect Enforcement**:
   - In Blind Connect mode, profile discovery and matches withhold photo URLs (`photos: []`) and `/api/profiles/media/:mediaId` enforces HTTP `403` until both matched members explicitly submit approval via `/api/blind-connect/:matchId/reveal`.

## 2. Gemini AI Privacy Boundary
- Implemented exclusively server-side in `server/services/gemini.ts`.
- Never executes unless the authenticated member has `consent_records.ai_processing_consent === 1` (`HTTP 403` returned if opted out; deterministic non-AI insights remain available).
- Before constructing prompts, `stripPii()` removes email addresses, phone numbers, URLs, and legal identifiers; only high-level relationship goals, lifestyle labels, interests, and compatibility dimension scores are summarized.
- User-supplied context (such as Date Planner neighborhood vibe or prompt drafts) passes prompt-injection stripping (`ignore previous instructions`, system-tag filtering).

## 3. Data Principal Rights (India DPDP Act 2023 & GDPR Alignment)
- **Right to Access & Portability**: `GET /api/safety/export` decrypts the authenticated user's own account fields on demand and downloads a structured JSON archive alongside an explicit disclosure that E2EE chat plaintexts reside only on local devices.
- **Right to Correction & Withdrawal of Consent**: Available continuously in `/edit-profile`, `/settings`, and `/privacy`.
- **Right to Erasure**: `DELETE /api/safety/account` cascades deletion of user rows, sessions, matches, profile data, Signal key bundles, and deletes uploaded media files from disk immediately.
