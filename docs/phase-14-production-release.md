# Phase 14 — Production launch readiness

## Goals

Make the deployed web SaaS observable, verifiable, and operationally ready without claiming that external infrastructure or real-device acceptance has already happened.

## Implemented in this phase

### Health probes
- `GET /api/health/live` is a dependency-free liveness endpoint.
- `GET /api/health/ready` connects to MongoDB and runs an admin ping.
- Readiness returns HTTP 503 with a retry hint when MongoDB is unavailable.
- Both endpoints are uncached and intentionally disclose no connection string, database name, host, or exception details.

### Deployed smoke checks
The `scripts/release-smoke.mjs` command checks:
- Liveness and MongoDB readiness.
- Public login and registration routes.
- Auth.js session endpoint availability.
- Redirect protection for unauthenticated dashboard access.
- Production security headers including HSTS.

Run locally or in CI with:
```bash
RELEASE_BASE_URL=https://your-domain.example npm run smoke:release
```

GitHub Actions → Production release smoke checks runs the same suite against a manually supplied canonical HTTPS origin. This verifies the deployed service, not just the source build.

### Production configuration validation
- Google OAuth configuration is checked for incomplete server credentials.
- If a native Google Web client ID is set, it must match `AUTH_GOOGLE_ID`.
- Android Capacitor is now configured from the `apps/web` workspace package manifest, so the CLI can discover the app's actual native plugin dependencies.
- Android CI verifies that App, Camera, Splash Screen, Status Bar, and Social Login modules are linked before Gradle compilation.
- The Android MainActivity uses the standard Capacitor bridge because this app requests only default OpenID Connect scopes and configures `skipAuthOnlyAuthorizationAfterSignIn`; it does not require the plugin-specific activity-result interface.
- Generated Android project output lives under `apps/web/android` and remains untracked.

## Production deployment checklist

### Vercel / Next.js
- Deploy the `main` branch and configure the production domain.
- Set all required environment variables in Production and Preview separately.
- Set `APP_URL` and `AUTH_URL` to the canonical HTTPS origin.
- Set a random `AUTH_SECRET` of at least 32 characters.
- Never expose MongoDB URI, Auth.js secret, Resend key, or OMR service key through `NEXT_PUBLIC_*`.
- Confirm the production build and deployed smoke workflow are green.

### MongoDB Atlas
- Use a replica-set Atlas deployment; transactions depend on it.
- Restrict network access to the actual hosting egress model; do not use unrestricted IP access as a permanent production policy.
- Enable automated backups / point-in-time recovery according to the chosen Atlas tier.
- Perform and document a restore drill before accepting institution data.
- Confirm TTL indexes, compound indexes, connection pool behavior, and two-tenant isolation against production-like data.

### Email and identity
- Verify the Resend sender domain and set `RESEND_API_KEY` and `RESULTS_FROM_EMAIL`.
- Configure Google OAuth authorized origins and callback URL `/api/auth/callback/google`.
- For Android, register package `com.omrexamchecker.app` with the exact debug/release SHA-1; add Play App Signing SHA-1 separately before store distribution.
- Test sign-in, sign-out, password handling, student result magic links, expiry, and account linking.

### Monitoring and incident response
- Configure external uptime monitoring against `/api/health/live`.
- Configure readiness monitoring against `/api/health/ready`; alert on sustained 503 responses.
- Connect hosting/runtime error alerts and database alerts to an actively monitored destination.
- Define an incident owner, rollback procedure, and backup restoration owner.
- Do not place credentials, tokens, answer sheets, or student personal data in logs.

### Privacy and legal
- Publish a privacy notice, terms of service, data retention policy, and support contact before onboarding real institutions.
- Define how institutions request exports/deletion and how student records are retained.
- Review email consent, student access links, and institutional data-processing obligations.

## Android release gate

The current Capacitor debug APK uses a remote `server.url` to load the Next.js server. Capacitor documents this as a development/live-reload feature, not a production deployment mode. It must not be submitted to Google Play.

Before a production Android release:
- Bundle a local frontend that can run inside the Android WebView and securely communicate with the existing Next.js backend, or approve a separately designed native architecture.
- Configure production signing and protect the upload key.
- Register Play App Signing credentials and Google OAuth SHA-1.
- Test camera capture/restoration, gallery uploads, navigation, session persistence, keyboard, print/PDF, network transitions, and tenant isolation on physical Android devices.
- Validate the complete OMR workflow using real printed sheets and camera images.

## Explicitly not complete

- Phase 10 payment gateway integration remains outstanding. The current billing module only records manual plan-change requests; no card/mobile-wallet payment is collected and paid subscriptions are not automatically activated.
- No external uptime/error monitoring provider is connected by this code change; operators must configure one.
- Atlas backups, restore drills, production tenant isolation, load tests, and physical Android acceptance require real infrastructure and operator access.
- This phase does not claim Google Play release readiness.

## Release acceptance

A release candidate is acceptable for the web SaaS only after:
1. CI passes on the exact release commit.
2. Vercel production deploy is healthy.
3. Both health probes pass from the deployed domain.
4. Release smoke workflow passes.
5. Atlas backup/restore, tenant isolation, email, OAuth, and representative load tests pass.
6. Operational alerts and privacy/legal pages are configured.

Android Play Store release remains blocked until its separate native packaging and physical acceptance gates pass.
