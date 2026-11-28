export type ReviewedAnswer = {
  questionNumber: number;
  answer: "A" | "B" | "C" | "D" | "BLANK" | "MULTIPLE" | "UNREADABLE";
};

export type AnswerKeyItem = { questionNumber: number; option: "A" | "B" | "C" | "D" };

export type QuestionScore = {
  questionNumber: number;
  correctOption: "A" | "B" | "C" | "D";
  submittedAnswer: ReviewedAnswer["answer"];
  outcome: "correct" | "incorrect" | "blank";
  marksAwarded: number;
};

export type SubjectScore = {
  questionCount: number;
  correctCount: number;
  incorrectCount: number;
  blankCount: number;
  marksObtained: number;
  maximumMarks: number;
  percentage: number;
  questions: QuestionScore[];
};

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Scores only examiner-reviewed answers. MULTIPLE and UNREADABLE count as
 * incorrect; BLANK receives zero and never incurs a negative mark.
 */
export function calculateSubjectScore(input: {
  questionCount: number;
  marksPerQuestion: number;
  negativeMarksPerQuestion: number;
  answerKey: AnswerKeyItem[];
  reviewedAnswers: ReviewedAnswer[];
}): SubjectScore {
  const { questionCount, marksPerQuestion, negativeMarksPerQuestion, answerKey, reviewedAnswers } = input;
  if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 300) {
    throw new Error("INVALID_QUESTION_COUNT");
  }
  if (!Number.isFinite(marksPerQuestion) || marksPerQuestion <= 0 ||
      !Number.isFinite(negativeMarksPerQuestion) || negativeMarksPerQuestion < 0) {
    throw new Error("INVALID_MARKING_RULE");
  }
  if (answerKey.length !== questionCount || reviewedAnswers.length !== questionCount) {
    throw new Error("INCOMPLETE_ANSWERS");
  }

  const key = new Map<number, AnswerKeyItem["option"]>();
  for (const item of answerKey) {
    if (!Number.isInteger(item.questionNumber) || item.questionNumber < 1 ||
        item.questionNumber > questionCount || key.has(item.questionNumber)) {
      throw new Error("INVALID_ANSWER_KEY");
    }
    key.set(item.questionNumber, item.option);
  }
  const submitted = new Map<number, ReviewedAnswer["answer"]>();
  for (const item of reviewedAnswers) {
    if (!Number.isInteger(item.questionNumber) || item.questionNumber < 1 ||
        item.questionNumber > questionCount || submitted.has(item.questionNumber)) {
      throw new Error("INVALID_REVIEWED_ANSWERS");
    }
    submitted.set(item.questionNumber, item.answer);
  }
  for (let number = 1; number <= questionCount; number += 1) {
    if (!key.has(number) || !submitted.has(number)) throw new Error("INCOMPLETE_ANSWERS");
  }

  let correctCount = 0;
  let incorrectCount = 0;
  let blankCount = 0;
  let rawMarks = 0;
  const questions: QuestionScore[] = [];

  for (let number = 1; number <= questionCount; number += 1) {
    const correctOption = key.get(number)!;
    const submittedAnswer = submitted.get(number)!;
    if (submittedAnswer === "BLANK") {
      blankCount += 1;
      questions.push({ questionNumber: number, correctOption, submittedAnswer, outcome: "blank", marksAwarded: 0 });
    } else if (submittedAnswer === correctOption) {
      correctCount += 1;
      rawMarks += marksPerQuestion;
      questions.push({ questionNumber: number, correctOption, submittedAnswer, outcome: "correct", marksAwarded: round2(marksPerQuestion) });
    } else {
      incorrectCount += 1;
      rawMarks -= negativeMarksPerQuestion;
      questions.push({ questionNumber: number, correctOption, submittedAnswer, outcome: "incorrect", marksAwarded: round2(-negativeMarksPerQuestion) });
    }
  }

  const maximumMarks = round2(questionCount * marksPerQuestion);
  const marksObtained = round2(rawMarks);
  return {
    questionCount,
    correctCount,
    incorrectCount,
    blankCount,
    marksObtained,
    maximumMarks,
    percentage: maximumMarks > 0 ? round2((marksObtained / maximumMarks) * 100) : 0,
    questions,
  };
}
