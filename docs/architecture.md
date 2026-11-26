# Architecture Overview

## Runtime boundaries

- The Next.js application owns authentication, tenant authorization, administration, and APIs.
- MongoDB stores institution-scoped application records.
- Object storage holds uploaded scans and generated artifacts; private objects are never publicly readable by default.
- Redis-backed jobs coordinate asynchronous OMR processing.
- The Python service performs image preprocessing and mark detection outside web request lifecycles.

## OMR correctness

- Every generated sheet must have a stable sheet identifier and machine-readable exam/template reference.
- Detection output includes per-question state and confidence, not only a guessed option.
- Blank, multiple-mark, and low-confidence answers are distinct states.
- Results with unresolved ambiguous answers remain provisional until reviewed.

## Tenant isolation

Every tenant-owned record carries an institution identifier. Server-side access must derive tenant membership from the authenticated session and enforce it in every read and write query. Client-provided tenant identifiers are never trusted as authorization.
