# Phase 15 — Production acceptance and operational evidence

## Purpose

Turn the existing CI and smoke-test foundations into an evidence-based release decision. A green build is necessary, but it does not prove that production credentials, MongoDB, tenant boundaries, OMR recognition, email delivery, or Android hardware work.

## Current automated checks

Run from the repository root:

```bash
npm install
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

Run Python checks:

```bash
cd services/omr-engine
ruff check .
pytest
```

After deploying the exact candidate commit, run:

```bash
RELEASE_BASE_URL=https://your-canonical-domain.example npm run smoke:release
```

Or use GitHub Actions → Production release smoke checks and enter the canonical HTTPS origin. The smoke suite checks liveness, MongoDB readiness, public login/register routes, Auth.js session availability, unauthenticated dashboard redirect, and production security headers. Health payloads must remain minimal and uncached.

## Operator acceptance record

Record the release commit SHA, deployment URL, date/time (UTC), tester, evidence link, and PASS/FAIL/BLOCKED for each item. Never put secrets, student names, roll numbers, raw answer sheets, or access tokens in evidence.

### A. Deployed web application

- [ ] Production deployment points to the exact candidate commit.
- [ ] `/api/health/live` returns HTTP 200.
- [ ] `/api/health/ready` returns HTTP 200 and MongoDB ping succeeds.
- [ ] Release smoke workflow passes.
- [ ] Registration, email/password login, logout, password failure, and session expiry behave correctly.
- [ ] Google OAuth callback and sign-in work with production origins.
- [ ] Result email sender domain is verified; send and receive a real test email.
- [ ] Student magic link works once, expires at the configured time, and cannot be reused.
- [ ] Protected routes redirect anonymous users; public routes remain accessible.

### B. MongoDB Atlas and recovery

- [ ] Production uses a replica-set deployment suitable for transactions.
- [ ] Network access is restricted to the hosting provider's documented egress model.
- [ ] Automated backups / point-in-time recovery are enabled for the selected Atlas tier.
- [ ] Restore a backup into an isolated staging database and verify representative collections and indexes.
- [ ] Record restore duration and recovery point; do not run destructive restore tests against production.
- [ ] Confirm unique, TTL, and tenant compound indexes exist.
- [ ] Verify connection pool and transaction behavior under representative concurrency.

### C. Multi-tenant isolation

Use two disposable test institutions and synthetic users/data. Do not use real student records.

- [ ] Institution A owner/admin can access only A's students, exams, scans, results, reports, and exports.
- [ ] Institution B owner/admin can access only B's records.
- [ ] Attempt cross-tenant access by substituting IDs in URL paths, query parameters, request bodies, and export filters.
- [ ] Verify cross-tenant scan image URLs and result IDs return a non-disclosing 404/403.
- [ ] Verify membership removal immediately blocks access on subsequent requests.
- [ ] Verify staff roles cannot perform owner-only actions.
- [ ] Save sanitized request/response evidence and confirm no data leakage.

### D. OMR physical accuracy acceptance

Do not infer accuracy from unit tests or synthetic images alone.

- [ ] Print the actual production template on at least two printer models at 100% / actual size; disable fit-to-page.
- [ ] Capture sheets using at least two Android device camera models under bright, dim, angled, and uneven-light conditions.
- [ ] Include clean, rotated, perspective-skewed, lightly shadowed, and intentionally damaged samples.
- [ ] Include blank, single-mark, changed-mark, multiple-mark, and erased/ambiguous bubbles.
- [ ] Compare every recognized response with a manually verified ground-truth answer sheet.
- [ ] Record per-question accuracy, blank/multiple classification accuracy, unreadable rate, and false-positive rate.
- [ ] Confirm uncertain results remain pending manual examiner review and cannot be graded before review.
- [ ] Set an explicit institution-approved accuracy threshold before enabling live exams; do not silently waive failures.

### E. Android device acceptance

The current remote `server.url` debug APK is for development/device acceptance only and is not a Play Store release.

- [ ] Install the generated debug APK on supported physical Android devices.
- [ ] Test fresh install, upgrade, sign-in/out, session persistence, app links, and Android back navigation.
- [ ] Test camera permission denial/grant, capture, Android process termination during capture, and restoration.
- [ ] Test gallery upload, network loss/reconnect, large image rejection, and upload retry.
- [ ] Test keyboard, screen rotation, small screens, accessibility labels, and print/PDF workflows.
- [ ] Confirm Google sign-in with the matching package name and signing SHA-1.
- [ ] Record device model, Android version, APK SHA-256, and test outcome.

A production Play Store build remains blocked until the frontend is bundled locally (or a separately reviewed architecture is approved), release signing and Play App Signing are configured, and the release OAuth SHA-1 is registered.

### F. Monitoring, load, privacy, and operations

- [ ] External uptime monitoring checks liveness from outside the hosting provider.
- [ ] Readiness failures and sustained application errors alert an actively monitored destination.
- [ ] Vercel/runtime and MongoDB alerts have an owner and escalation path.
- [ ] Load test representative exam creation, scan intake, recognition, grading, report queries, and CSV export using synthetic data.
- [ ] Confirm rate limits, upload bounds, timeouts, and graceful overload responses.
- [ ] Publish privacy notice, terms, retention/deletion policy, and support contact before real institution onboarding.
- [ ] Document incident response, rollback, backup restore owner, and support escalation.

## Release decision

A web SaaS release is **GO** only when sections A, B, C, and F are evidenced and the OMR workflow in D meets the agreed accuracy threshold. Android distribution has a separate gate in E. Any untested item is BLOCKED, not PASS.

Phase 10 payment gateway integration remains separate. No online payments or automatic paid-plan activation are implied by this phase.
