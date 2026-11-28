import test from "node:test";
import assert from "node:assert/strict";
import { rankCandidates } from "./rankings.ts";

const candidate = (id, code, percentage, marks) => ({
  studentId: id, studentCode: code, studentName: code, className: "10", section: "A",
  totalMarksObtained: marks, totalMaximumMarks: 100, percentage,
});

test("uses competition ranking for equal percentage and marks", () => {
  const rows = rankCandidates([candidate("c", "C", 70, 70), candidate("b", "B", 90, 90), candidate("a", "A", 90, 90), candidate("d", "D", 60, 60)]);
  assert.deepEqual(rows.map((row) => row.rank), [1, 1, 3, 4]);
  assert.deepEqual(rows.map((row) => row.studentCode), ["A", "B", "C", "D"]);
});

test("returns no rows for an empty candidate list", () => {
  assert.deepEqual(rankCandidates([]), []);
});
