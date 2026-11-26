# OMR Exam Checker

Multi-tenant OMR examination management SaaS for schools, colleges, and coaching institutions.

## Planned architecture

- `apps/web`: Next.js App Router application
- `services/omr-engine`: Python/OpenCV processing worker
- `packages/*`: shared types, validation, and database contracts
- `infrastructure`: local development and deployment assets
- `docs`: architecture and engineering decisions

## Development principles

- Enforce institution-level tenant isolation on every server-side access.
- Treat low-confidence OMR detections as requiring human review.
- Keep image processing in an asynchronous worker, not inside web requests.
- Validate external input at boundaries and audit consequential actions.
- Run lint, type checks, tests, and production builds before merging.

## Status

Phase 0 — repository foundation in progress.
