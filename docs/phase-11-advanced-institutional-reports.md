# Phase 11 — Advanced institutional reports

## Included
- Institution-scoped reports from published results and the latest revision per student/exam.
- UTC publication date range, class and exam filters.
- Exam trend comparison with average, highest, lowest and candidate count.
- Class and section performance breakdown.
- Student progress across exams, ranked by average percentage, with result timelines.
- Subject-by-exam trends and answer outcome counts.
- Filtered CSV export with formula-injection protection and browser print-to-PDF.
- Bounded report workload and a visible truncation warning.

## Data semantics
- Date filters use publishedAt UTC calendar boundaries, not calculation time.
- Latest published revision is selected before filters, so an older revision cannot reappear after a newer revision.
- Student progress is tenant-scoped and limited to the selected exam/date/class filter.
- No pass/fail classification is inferred because the Exam model has no pass threshold.
- No ranking compares raw marks across unrelated exams; progress averages percentages.

## Limits and operational checks
- Aggregation examines at most 5,001 latest candidate/exam result records; warning shown above 5,000.
- Student progress shows top 100 by average percentage; subject trend capped at 500 rows.
- CSV export capped at 10,000 rows.
- Validate tenant isolation, UTC date boundaries, Atlas aggregation performance and print layout before launch.
