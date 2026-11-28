# Phase 12 — Production security, performance and scalability

## Implemented

- Shared MongoDB-backed request throttling. Each request counter is updated atomically and expires through a TTL index; keys are HMAC-SHA256 digests rather than raw IP addresses.
- Rate limits are applied to credential sign-in, scan intake/correction/registration inspection/recognition/matching, examiner review, grading, result publishing, report exports, result exports, and student magic-link exchange.
- Rate limiting fails closed with HTTP 503 if its security dependency is unavailable, and returns HTTP 429 with Retry-After for over-limit clients.
- Credential sign-in allows 8 attempts per 15 minutes per client address; sensitive scan operations have tighter limits, and export/review routes have separate scopes.
- Environment validation checks MongoDB URI scheme, database name, strong AUTH_SECRET, HTTPS production APP_URL, and optional OMR service configuration.
- MongoDB primary and Auth.js adapter pools have explicit bounds, idle cleanup, wait-queue limits, connection timeouts and retry settings.
- Compound indexes support scan-to-candidate grading, recognition history, and published-result reporting.
- Global response headers include nosniff, clickjacking protection, strict referrer policy, camera permission scoping, and production HSTS.
- Unit tests cover client-address parsing, request-limit boundary behavior, and production environment validation.

## Rate-limit policy

Limits are per client IP and per named operation scope. Reverse proxies must provide a trusted x-real-ip or x-forwarded-for address. Requests without a valid address share the unknown bucket, which is deliberately fail-safe. Do not put raw IPs or secrets in logs.

## Deployment requirements

- Set AUTH_SECRET to a cryptographically random value of at least 32 characters.
- Set APP_URL to the canonical HTTPS production URL.
- Set valid MONGODB_URI and MONGODB_DB_NAME values.
- Ensure the app database user can create the rate_limits_expire_at TTL index. If production database permissions prohibit index creation, create it through the deployment DBA/migration process before enabling traffic.
- Ensure the deployment proxy supplies the actual client IP header. Never trust client-supplied forwarding headers unless the hosting proxy overwrites them.
- Review the configured limits against real usage and hosting/IP topology before a public launch.

## Operational and acceptance work still required

- Verify TTL index creation and atomic counter behavior against production MongoDB Atlas.
- Test sign-in and scan throttling from real deployed clients and confirm proxy IP headers are not spoofable.
- Verify every membership/tenant boundary with at least two independent institutions.
- Run a load test with representative exam sizes and measure query plans using Atlas Performance Advisor.
- Configure external uptime/error alerting and a documented incident response contact. This phase adds safe server logs and hardening but does not claim an external monitoring provider is connected.
- Confirm production environment values and HSTS behavior after deployment.
- A full CSP is intentionally not enabled here: the current Next.js/Google OAuth flows need a nonce-based policy designed and browser-tested separately rather than an unsafe blanket policy.