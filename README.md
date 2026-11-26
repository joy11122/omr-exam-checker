# OMR Exam Checker

A multi-tenant OMR examination management SaaS for schools, colleges, and coaching institutions.

## Product decisions

- Web application: Next.js App Router + TypeScript
- Validation: Zod at every untrusted input boundary
- Database: MongoDB Atlas with Mongoose
- Authentication: Auth.js (email/password and optional Google OAuth), MongoDB adapter
- OMR processing: separate Python/OpenCV worker
- Mobile target: Android only, using Capacitor when the web workflow is ready
- iOS: explicitly out of scope
- UX: ChatGPT-inspired workspace with a collapsible sidebar and responsive central work area

## Local development

1. Install Node.js 20.9 or later.
2. Create a MongoDB Atlas cluster and database named `omr_exam_checker`.
3. Copy `apps/web/.env.example` to `apps/web/.env.local`.
4. Set `MONGODB_URI`, `MONGODB_DB_NAME`, and a strong `AUTH_SECRET`.
5. Install dependencies from the repository root: `npm install`.
6. Start the web app: `npm run dev:web`.

Google sign-in is enabled when `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are configured. Set the Google OAuth callback URL to `/api/auth/callback/google` on local and deployed origins.

## Security principles

- MongoDB credentials and OAuth secrets are server-only; never prefix them with `NEXT_PUBLIC_`.
- Every tenant-owned read/write must verify membership on the server using `requireInstitutionRole`.
- Never trust a client-provided institution ID without checking the authenticated user's membership.
- Institution creation and owner membership are written in a MongoDB transaction (Atlas replica-set deployment required).
- Unique indexes enforce institution slug uniqueness and one membership per user/institution pair.
- Keep uploaded answer sheets private; use short-lived signed URLs when scan storage is introduced.
- Treat low-confidence OMR detections as requiring human review.

## Quality gates

Before merging, run web lint, TypeScript checks, production build, Python lint, and Python tests.

## Current status

- Phase 0: repository foundation merged.
- Phase 1: MongoDB-backed authentication, institution onboarding, and tenant authorization migration in progress.
