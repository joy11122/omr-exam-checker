# OMR Exam Checker

A multi-tenant OMR examination management SaaS for schools, colleges, and coaching institutions.

## Product decisions

- Web application: Next.js App Router + TypeScript
- Validation: Zod at every untrusted input boundary
- Backend platform: Supabase Auth, PostgreSQL, Row Level Security, Storage, and Realtime
- OMR processing: separate Python/OpenCV worker
- Mobile target: Android only, using Capacitor when the web workflow is ready
- iOS: explicitly out of scope
- UX: ChatGPT-inspired workspace with a collapsible sidebar and responsive conversation-like work area

## Repository structure

- `apps/web`: Next.js application
- `services/omr-engine`: Python processing service
- `supabase/migrations`: version-controlled database schema and RLS policies
- `docs`: architecture and operational runbooks

## Local development

1. Install Node.js 20.9 or later.
2. Copy `apps/web/.env.example` to `apps/web/.env.local`.
3. Create a Supabase project and set the public project URL and anon/publishable key.
4. Apply migrations with the Supabase CLI: `supabase db push`.
5. Install dependencies from the repository root: `npm install`.
6. Start the web app: `npm run dev:web`.

The Google provider must be enabled in Supabase Authentication if Google sign-in is desired. Email magic-link sign-in is also supported. Set the allowed redirect URL to the local and deployed `/auth/callback` routes in Supabase Auth settings.

## Security principles

- Never expose the Supabase service-role key in browser code.
- Enforce tenant isolation with PostgreSQL Row Level Security, not client-side filtering.
- Derive tenant membership from the authenticated Supabase user.
- Use the `create_institution` RPC to atomically create an institution and its owner membership.
- Keep uploaded answer sheets private; use short-lived signed URLs when scan storage is introduced.
- Treat low-confidence OMR detections as requiring human review.

## Quality gates

Before merging, run web lint, TypeScript checks, production build, Python lint, and Python tests. Database migrations must also be reviewed for RLS coverage before deployment.

## Current status

- Phase 0: repository foundation merged.
- Phase 1: Supabase authentication, institution onboarding, and tenant isolation in progress.
