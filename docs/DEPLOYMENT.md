# BondAI Deployment & Production Readiness Guide

## 1. Provision Managed Infrastructure
1. **MongoDB Atlas (`MONGODB_URI`)**:
   - Create an M10+ cluster in your target region (e.g., `ap-south-1` Mumbai for India DPDP data residency).
   - Enable encryption at rest, continuous cloud backups, TLS-only connections, and IP allowlisting / VPC peering.
   - Schemas and indexes are defined in `server/db/mongooseModels.ts`.
2. **Memorystore / Redis (`REDIS_URL`)**:
   - Provision a TLS-enabled Redis 7 instance for distributed rate limiting (`server/db/redis.ts`) and horizontal Socket.IO pub/sub across Cloud Run instances.
3. **Private Object Storage**:
   - Replace local `data/media` / `data/encrypted_media` disk paths with a private Cloud Storage bucket (uniform bucket-level access, public access prevention ON, CMEK encryption) and run EXIF stripping (`sharp`) + antivirus scanning (`ClamAV`) on media ingestion.
4. **Google Cloud KMS & Secret Manager**:
   - Generate separate 32-byte hex keys (`openssl rand -hex 32`) for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `FIELD_ENCRYPTION_MASTER_KEY`, and `BLIND_INDEX_HMAC_KEY`.
   - Wrap master encryption keys via `GOOGLE_CLOUD_KMS_KEY_NAME` and inject secrets via Cloud Run Secret Manager bindings (`--set-secrets`).
5. **Transactional Email**:
   - Wire `server/routes/auth.ts` verification & password reset flows to an authenticated email provider (Amazon SES / Postmark / Resend) instead of returning dev verification tokens.

## 2. Deploy to Google Cloud Run
```bash
# Build & push container image
gcloud builds submit --tag gcr.io/$PROJECT_ID/bondai:latest

# Deploy service (TLS enforced automatically by Cloud Run)
gcloud run deploy bondai \
  --image gcr.io/$PROJECT_ID/bondai:latest \
  --region asia-south1 \
  --port 3000 \
  --set-env-vars "NODE_ENV=production,ENABLE_DEV_DEMO_ACCOUNTS=false,APP_URL=https://app.yourdomain.com" \
  --set-secrets "GEMINI_API_KEY=gemini-key:latest,JWT_ACCESS_SECRET=jwt-access:latest,JWT_REFRESH_SECRET=jwt-refresh:latest,FIELD_ENCRYPTION_MASTER_KEY=field-enc-key:latest,BLIND_INDEX_HMAC_KEY=blind-hmac:latest,MONGODB_URI=mongo-uri:latest,REDIS_URL=redis-uri:latest"
```
Map your custom domain (`gcloud beta run domain-mappings create`) to enable managed HTTPS certificates, strict HSTS, and WebSocket support (`session-affinity` enabled for Socket.IO or `@socket.io/redis-adapter`).

## 3. Production Launch Checklist
- [ ] Replace SQLite single-node persistence with MongoDB Atlas (`MONGODB_URI`) and enable `@socket.io/redis-adapter`.
- [ ] Store all secrets in Cloud Secret Manager + KMS; ensure `ALLOW_EPHEMERAL_SECRETS` is NOT set in production.
- [ ] Set `ENABLE_DEV_DEMO_ACCOUNTS=false` and `NODE_ENV=production`.
- [ ] Connect real transactional SMTP/API email verification and remove dev token echo in non-dev environments.
- [ ] Move local `data/media` and `data/encrypted_media` to private GCS bucket with EXIF stripping & ClamAV malware scanning.
- [ ] Enable Cloud Armor WAF + automated `npm audit` / container vulnerability scanning in CI.
- [ ] Execute independent third-party penetration test and cryptographic audit before opening public signups.
- [ ] Publish grievance officer contact details in Privacy Policy for India DPDP Act 2023 compliance.
