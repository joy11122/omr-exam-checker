# Architecture Overview

## Product constraints

- Next.js App Router and TypeScript are the web application foundation.
- Zod validates form, route, and server-action input.
- MongoDB Atlas is the source of truth, accessed through Mongoose.
- Auth.js manages sessions and optional Google OAuth; the MongoDB adapter stores OAuth accounts and sessions.
- Android is the only native mobile target. Capacitor Android packaging is planned after the web workflow is stable. iOS is out of scope.
- The product UI uses a ChatGPT-inspired workspace: collapsible left navigation and a focused central work area.

## Runtime boundaries

- Next.js owns authenticated user experience, server actions, tenant-aware application APIs, and administration.
- Auth.js owns identity and session issuance.
- MongoDB stores users, institutions, memberships, exams, students, answer keys, scans, and results.
- Every tenant-owned operation must enforce membership and role checks on the server; client-side filtering is never an authorization boundary.
- MongoDB Atlas transactions keep institution creation and owner membership atomic.
- The Python/OpenCV service performs image preprocessing and mark detection outside web request lifecycles.

## Identity and tenant model

- One user can belong to multiple institutions.
- Each institution has independent memberships and role assignments.
- Roles: owner, admin, teacher, examiner.
- Authenticated identity comes from the Auth.js session, never from a client-provided user ID.
- Tenant membership is resolved from MongoDB membership collection for each protected operation.
- Unique indexes enforce institution slug uniqueness and one membership per user/institution pair.

## OMR correctness

- Every generated sheet has a stable sheet identifier and machine-readable exam/template reference.
- Detection output includes per-question state and confidence, not only a guessed option.
- Blank, multiple-mark, and low-confidence answers are distinct states.
- Results with unresolved ambiguous answers remain provisional until reviewed.

## Mobile

- Android only. Use Capacitor Android once the web app's camera upload, scan review, and authentication flows are stable.
- Do not add iOS platform targets, iOS CI jobs, or iOS release configuration.
