# Architecture Overview

## Product constraints

- Next.js App Router and TypeScript are the web application foundation.
- Zod validates form, route, and server-action input.
- Supabase provides authentication, PostgreSQL, Row Level Security, private object storage, and realtime subscriptions where needed.
- Android is the only native mobile target. Capacitor Android packaging is planned after the responsive web workflow is stable. iOS is out of scope.
- The product UI uses a ChatGPT-inspired workspace: collapsible left navigation, compact navigation groups, and a focused central work area.

## Runtime boundaries

- Next.js owns authenticated user experience, server actions, tenant-aware application APIs, and administration.
- Supabase Auth owns identity and session issuance.
- PostgreSQL is the source of truth for institutions, memberships, exams, students, answer keys, scans, and results.
- Row Level Security enforces institution-level access for every tenant-owned table.
- Supabase Storage holds private uploaded scans and generated artifacts. Objects are not public by default.
- Redis-backed jobs coordinate asynchronous OMR processing.
- The Python/OpenCV service performs image preprocessing and mark detection outside web request lifecycles.

## Identity and tenant model

- One auth user can belong to multiple institutions.
- Each institution has independent memberships and role assignments.
- Roles: owner, admin, teacher, examiner.
- Tenant membership is derived from the authenticated Supabase user, never from a client-provided institution ID.
- Institution creation is performed through a transactional SECURITY DEFINER RPC that creates the institution and owner membership together.
- RLS policies are mandatory for every tenant-owned table. Service-role access is restricted to trusted server/worker contexts.

## OMR correctness

- Every generated sheet has a stable sheet identifier and machine-readable exam/template reference.
- Detection output includes per-question state and confidence, not only a guessed option.
- Blank, multiple-mark, and low-confidence answers are distinct states.
- Results with unresolved ambiguous answers remain provisional until reviewed.

## Mobile

- Android only. Use Capacitor Android once the web app's camera upload, scan review, and authentication flows are stable.
- Do not add iOS platform targets, iOS CI jobs, or iOS release configuration.
