# Phase 8 — Analytics, reports and performance insights

## Included
- Institution-wide analytics use published results only and select the latest published revision per exam and student.
- Exam comparison reports candidate count, average percentage, highest and lowest percentage.
- Class/section and subject-level performance summaries.
- Per-exam merit list with deterministic ordering and shared ranks for identical percentage and marks.
- Excel-compatible UTF-8 CSV exports, scoped to the selected institution and optionally one exam.
- Browser print styles support saving the report as PDF.
- Exports protect spreadsheet formula injection and are capped at 10,000 rows.

## Data rules
- Draft and unpublished results are excluded.
- A candidate appears once per exam, using the latest published revision.
- Rankings are shown only for one selected exam; unrelated exams are not combined into a single merit ranking.
- Equal percentage and marks share a rank; competition ranking is used (1, 1, 3).
- Pass/fail is not calculated because the Exam model has no configured pass threshold.
- Class and subject summaries are descriptive aggregates based on the published result snapshots.

## Operational acceptance checks
- Run lint, TypeScript, grading and analytics tests, and the production build.
- Test two institutions, multiple result revisions, draft and published records, ties, missing class values, and empty result sets.
- Validate MongoDB Atlas aggregation performance with realistic data volume.
- Verify export authorization, tenant isolation, spreadsheet formula escaping, and 10,000-row limit.
- Physical printer/camera recognition accuracy remains a separate acceptance task.
