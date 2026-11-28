# OMR Exam Checker

A multi-tenant OMR examination management SaaS for schools, colleges, and coaching institutions.

## Technology

- Next.js App Router, React, and TypeScript
- Zod validation at untrusted input boundaries
- MongoDB Atlas with Mongoose and the Auth.js MongoDB adapter
- Auth.js email/password and optional Google sign-in
- Python, FastAPI, and OpenCV for OMR image processing
- Android-only Capacitor wrapper; iOS is out of scope

## Requirements

- Node.js 22+
- MongoDB Atlas (replica set deployment required for transactions)
- Python 3.11+ for the OMR engine
- Android Studio, JDK 21, and Android SDK Platform 36 for Android development

## Web application setup

1. Install dependencies from the repository root:

   ```bash
   npm install
   ```

2. Copy `apps/web/.env.example` to `apps/web/.env.local`.
3. Configure `MONGODB_URI`, `MONGODB_DB_NAME`, a random `AUTH_SECRET` (at least 32 characters), and `APP_URL`.
4. Start the Next.js application:

   ```bash
   npm run dev:web
   ```

The app runs on port 3000 by default. For local Auth.js, keep `AUTH_URL=http://localhost:3000` and `APP_URL=http://localhost:3000`.

Google sign-in is optional. For browser sign-in, configure both `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. For Android native Google sign-in, set `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` to the exact same Web OAuth client ID as `AUTH_GOOGLE_ID`; register Android package name and signing SHA-1 in the same Google Cloud project.

## OMR engine

The Python service is under `services/omr-engine`:

```bash
cd services/omr-engine
python -m venv .venv
# Activate the environment, then:
python -m pip install -e '.[dev]'
cp .env.example .env
uvicorn app.main:app --reload
```

Use a long random `OMR_ENGINE_API_KEY`. Keep the service private and configure the same secret only in the Next.js server environment if the service is connected to the deployed app.

## Verification commands

From the repository root:

```bash
npm run lint:web
npm run typecheck:web
npm run test:grading
npm run test:analytics
npm run test:billing
npm run test:reports
npm run test:security
npm run test:native
npm run check:android:scripts
npm run build:web
```

For Python:

```bash
cd services/omr-engine
ruff check .
pytest
```

## Operational endpoints

- `GET /api/health/live`: process liveness; does not depend on MongoDB.
- `GET /api/health/ready`: readiness; performs a MongoDB ping and returns 503 when the database is unavailable.

After deployment, run the public release smoke suite:

```bash
RELEASE_BASE_URL=https://your-canonical-domain.example npm run smoke:release
```

Or run GitHub Actions → Production release smoke checks and supply the canonical HTTPS origin.

## Android

Capacitor is configured in `apps/web/capacitor.config.ts`, alongside the Next.js workspace manifest:

```bash
npm run android:add
npm run android:sync
npm run android:build
npm run android:open
```

The generated Android project is `apps/web/android` and is intentionally not committed. For a debug APK, use GitHub Actions → Android APK.

**The current APK workflow is for development and device acceptance only.** It uses Capacitor's remote `server.url` to load the deployed Next.js server. This is not a production Play Store architecture. Do not publish the debug APK. A bundled native web frontend / separately approved architecture, production signing, Google Play App Signing setup, and physical-device acceptance are required first.

## Security and tenancy

- Every tenant-owned operation must verify membership and role on the server.
- Client-supplied institution IDs are never authorization proof.
- MongoDB credentials, Auth.js secrets, Resend keys, and OMR engine keys are server-only.
- Uploaded OMR images remain private and tenant-scoped.
- Ambiguous OMR detections require examiner review before grading.
- Production launch must include Atlas backups and a tested restore procedure, external uptime/error monitoring, and two-tenant isolation checks.

## Phase status

- Phases 0–9: merged (Phase 9 provides subscription plans and manual plan-change requests; no payment gateway is connected).
- Phase 11: advanced institutional reports, merged.
- Phase 12: production security/performance hardening, merged.
- Phase 13: Android Capacitor foundation, merged; Gradle plugin wiring and physical-device acceptance are being verified.
- Phase 14: production launch readiness in progress.
- Phase 10 payment gateway integration remains a separate outstanding phase. No online payment is collected and paid plans are not automatically activated.
