import assert from "node:assert/strict";
import test from "node:test";
import { calculateSubjectScore } from "./scoring.ts";

const key = [
  { questionNumber: 1, option: "A" },
  { questionNumber: 2, option: "B" },
  { questionNumber: 3, option: "C" },
  { questionNumber: 4, option: "D" },
];

test("scores correct, incorrect, blank, and multiple answers with negative marking", () => {
  const result = calculateSubjectScore({
    questionCount: 4,
    marksPerQuestion: 2,
    negativeMarksPerQuestion: 0.5,
    answerKey: key,
    reviewedAnswers: [
      { questionNumber: 1, answer: "A" },
      { questionNumber: 2, answer: "A" },
      { questionNumber: 3, answer: "BLANK" },
      { questionNumber: 4, answer: "MULTIPLE" },
    ],
  });
  assert.equal(result.correctCount, 1);
  assert.equal(result.incorrectCount, 2);
  assert.equal(result.blankCount, 1);
  assert.equal(result.marksObtained, 1);
  assert.equal(result.maximumMarks, 8);
  assert.equal(result.percentage, 12.5);
});

test("unreadable answers count as incorrect", () => {
  const result = calculateSubjectScore({
    questionCount: 4,
    marksPerQuestion: 1,
    negativeMarksPerQuestion: 0.25,
    answerKey: key,
    reviewedAnswers: key.map((item) => ({ questionNumber: item.questionNumber, answer: "UNREADABLE" })),
  });
  assert.equal(result.incorrectCount, 4);
  assert.equal(result.marksObtained, -1);
});

test("rejects incomplete answer keys", () => {
  assert.throws(() => calculateSubjectScore({
    questionCount: 4,
    marksPerQuestion: 1,
    negativeMarksPerQuestion: 0,
    answerKey: key.slice(0, 3),
    reviewedAnswers: key.map((item) => ({ questionNumber: item.questionNumber, answer: item.option })),
  }), /INCOMPLETE_ANSWERS/);
});

test("rejects duplicate reviewed question numbers", () => {
  assert.throws(() => calculateSubjectScore({
    questionCount: 4,
    marksPerQuestion: 1,
    negativeMarksPerQuestion: 0,
    answerKey: key,
    reviewedAnswers: [
      { questionNumber: 1, answer: "A" },
      { questionNumber: 1, answer: "B" },
      { questionNumber: 3, answer: "C" },
      { questionNumber: 4, answer: "D" },
    ],
  }), /INVALID_REVIEWED_ANSWERS/);
});
