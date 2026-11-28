# Phase 9 — SaaS subscriptions, billing and usage limits

## Scope
- Institution-scoped subscription record with plan, status, billing interval, period, cancellation intent, requested plan and payment-provider references.
- Free, Growth and Enterprise plan catalog with explicit student, exam, member and monthly scan allowances.
- Server-side usage summary and reusable quota assertion.
- Authenticated billing summary endpoint and owner-only plan-change request endpoint.
- Plan changes remain pending until an authorized billing operator confirms them.

## Important payment boundary
No payment gateway is configured by this phase. The system does not collect card or mobile-wallet credentials, create payment intents, claim a payment succeeded, or activate paid plans automatically. Pricing is intentionally not hard-coded; Growth and Enterprise display contact-sales pricing. A gateway adapter and verified webhook flow must be added after the business selects a provider and pricing.

## Initial default limits
- Free: 100 students, 10 exams, 5 members, 300 scans/month.
- Growth: 2,000 students, 100 exams, 25 members, 5,000 scans/month.
- Enterprise: limits are custom/unlimited (null).

These are product defaults and should be reviewed before public launch.

## Operational acceptance
- Verify owner/admin authorization and tenant isolation with two institutions.
- Verify quota checks at every create/import/intake path before production rollout.
- Verify subscription uniqueness and concurrent plan-change requests in MongoDB Atlas.
- Add payment provider credentials and webhook signature verification only after provider selection.
- Configure support and billing operations for pending requests.
