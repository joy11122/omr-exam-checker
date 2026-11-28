import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { getCurrentInstitution } from "@/lib/tenancy/current-institution";
import { requireInstitutionRole } from "@/lib/tenancy/authorization";
import { Exam, Recognition, Scan, Student } from "@/models";
import { ExamResult } from "@/models/exam-result";
import { calculateSubjectScore, type ReviewedAnswer } from "@/lib/grading/scoring";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ examId: string }> };
type ExamSubject = {
  _id: mongoose.Types.ObjectId;
  name: string;
  questionCount: number;
  marksPerQuestion: number;
  negativeMarksPerQuestion: number;
  answerKey: Array<{ questionNumber: number; option: "A" | "B" | "C" | "D" }>;
};
type RecognitionRecord = {
  _id: mongoose.Types.ObjectId;
  scanId: mongoose.Types.ObjectId;
  subjectId: mongoose.Types.ObjectId;
  pageNumber: number;
  status: string;
  createdAt: Date;
  answers: ReviewedAnswer[];
};
type StudentRecord = {
  _id: mongoose.Types.ObjectId;
  studentCode: string;
  fullName: string;
  className?: string;
  section?: string;
  rollNumber?: string;
};

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id || !mongoose.isValidObjectId(session.user.id)) {
      return NextResponse.json({ error: "Sign in to calculate results." }, { status: 401 });
    }
    const { examId } = await context.params;
    if (!mongoose.isValidObjectId(examId)) return NextResponse.json({ error: "Exam not found." }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const afterStudentId = searchParams.get("afterStudentId");
    if (afterStudentId && !mongoose.isValidObjectId(afterStudentId)) {
      return NextResponse.json({ error: "Invalid grading batch cursor." }, { status: 400 });
    }

    const institution = await getCurrentInstitution(session.user.id);
    if (!institution) return NextResponse.json({ error: "Institution not found." }, { status: 403 });
    await requireInstitutionRole(institution.institutionId, "examiner");
    await connectToDatabase();

    const institutionId = new mongoose.Types.ObjectId(institution.institutionId);
    const examObjectId = new mongoose.Types.ObjectId(examId);
    const exam = await Exam.findOne({ _id: examObjectId, institutionId })
      .select("title examCode subjects sheetSettings")
      .lean()
      .exec() as unknown as { title: string; examCode: string; subjects: ExamSubject[]; sheetSettings?: { questionsPerPage?: number } } | null;
    if (!exam) return NextResponse.json({ error: "Exam not found in this institution." }, { status: 404 });

    for (const subject of exam.subjects) {
      if (subject.answerKey.length !== subject.questionCount) {
        return NextResponse.json({
          error: "Complete every subject answer key before grading.",
          subject: subject.name,
          expected: subject.questionCount,
          configured: subject.answerKey.length,
        }, { status: 409 });
      }
      const keyNumbers = new Set(subject.answerKey.map((item) => item.questionNumber));
      if (keyNumbers.size !== subject.questionCount ||
          Array.from({ length: subject.questionCount }, (_, index) => index + 1).some((number) => !keyNumbers.has(number))) {
        return NextResponse.json({ error: "An answer key contains missing or duplicate question numbers.", subject: subject.name }, { status: 409 });
      }
    }

    // Stable ObjectId pagination supports institutions with more than 250 students.
    // Keep historical candidates gradeable even if their enrollment is now inactive.
    const studentQuery: Record<string, unknown> = { institutionId };
    if (afterStudentId) studentQuery._id = { $gt: new mongoose.Types.ObjectId(afterStudentId) };
    const studentBatch = await Student.find(studentQuery)
      .sort({ _id: 1 })
      .limit(251)
      .select("_id studentCode fullName className section rollNumber")
      .lean()
      .exec() as unknown as StudentRecord[];
    const hasMore = studentBatch.length > 250;
    const batchStudents = studentBatch.slice(0, 250);
    const nextCursor = hasMore && batchStudents.length ? String(batchStudents[batchStudents.length - 1]._id) : null;
    if (batchStudents.length === 0) {
      return NextResponse.json({
        exam: { id: examId, title: exam.title },
        summary: { candidates: 0, graded: 0, unchanged: 0, skipped: 0 },
        skipped: [],
        hasMore: false,
        nextCursor: null,
      }, { headers: { "Cache-Control": "no-store" } });
    }

    const studentObjectIds = batchStudents.map((student) => student._id);
    const studentById = new Map(batchStudents.map((student) => [String(student._id), student]));
    const matchedScans = await Scan.find({
      institutionId,
      examId: examObjectId,
      studentId: { $in: studentObjectIds },
    })
      .select("_id studentId")
      .limit(5001)
      .lean()
      .exec() as unknown as Array<{ _id: mongoose.Types.ObjectId; studentId: mongoose.Types.ObjectId }>;
    if (matchedScans.length > 5000) {
      return NextResponse.json({ error: "This 250-student batch contains more than 5,000 matched sheets. Contact an administrator to split the import." }, { status: 413 });
    }

    const candidateIds = [...new Set(matchedScans.map((scan) => String(scan.studentId)))];
    if (candidateIds.length === 0) {
      return NextResponse.json({
        exam: { id: examId, title: exam.title },
        summary: { candidates: 0, graded: 0, unchanged: 0, skipped: 0 },
        skipped: [],
        hasMore,
        nextCursor,
      }, { headers: { "Cache-Control": "no-store" } });
    }

    const scanToStudent = new Map(matchedScans.map((scan) => [String(scan._id), String(scan.studentId)]));
    const recognitions = await Recognition.find({
      institutionId,
      examId: examObjectId,
      scanId: { $in: matchedScans.map((scan) => scan._id) },
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(10001)
      .select("_id scanId subjectId pageNumber status createdAt answers")
      .lean()
      .exec() as unknown as RecognitionRecord[];
    if (recognitions.length > 10000) {
      return NextResponse.json({ error: "Too many recognition attempts are attached to this batch. Contact an administrator to archive old attempts." }, { status: 413 });
    }

    const latestByCandidatePage = new Map<string, RecognitionRecord>();
    for (const recognition of recognitions) {
      const studentId = scanToStudent.get(String(recognition.scanId));
      if (!studentId) continue;
      const key = studentId + ":" + String(recognition.subjectId) + ":" + recognition.pageNumber;
      if (!latestByCandidatePage.has(key)) latestByCandidatePage.set(key, recognition);
    }

    const candidateObjectIds = candidateIds.map((id) => new mongoose.Types.ObjectId(id));
    const previousResults = await ExamResult.aggregate([
      { $match: { institutionId, examId: examObjectId, studentId: { $in: candidateObjectIds } } },
      { $sort: { revision: -1, calculatedAt: -1 } },
      { $group: { _id: "$studentId", result: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$result" } },
    ]).exec() as Array<{ studentId: mongoose.Types.ObjectId; revision: number; sourceHash: string }>;
    const previousByStudent = new Map(previousResults.map((result) => [String(result.studentId), result]));

    const questionsPerPage = exam.sheetSettings?.questionsPerPage ?? 40;
    const skipped: Array<{ studentId: string; reason: string }> = [];
    let graded = 0;
    let unchanged = 0;

    for (const studentId of candidateIds) {
      const student = studentById.get(studentId);
      if (!student) {
        skipped.push({ studentId, reason: "student_inactive_or_missing" });
        continue;
      }

      const subjectResults = [];
      const sourceIds: string[] = [];
      let incompleteReason: string | null = null;
      for (const subject of exam.subjects) {
        const pageCount = Math.ceil(subject.questionCount / questionsPerPage);
        const reviewedAnswers: ReviewedAnswer[] = [];
        for (let pageNumber = 0; pageNumber < pageCount; pageNumber += 1) {
          const key = studentId + ":" + String(subject._id) + ":" + pageNumber;
          const record = latestByCandidatePage.get(key);
          if (!record) {
            incompleteReason = "missing_recognition_page";
            break;
          }
          if (record.status !== "reviewed") {
            incompleteReason = "examiner_review_pending";
            break;
          }
          const firstQuestion = pageNumber * questionsPerPage + 1;
          const lastQuestion = Math.min(subject.questionCount, firstQuestion + questionsPerPage - 1);
          if (record.answers.length !== lastQuestion - firstQuestion + 1 ||
              record.answers.some((answer) => answer.questionNumber < firstQuestion || answer.questionNumber > lastQuestion)) {
            incompleteReason = "invalid_reviewed_question_set";
            break;
          }
          reviewedAnswers.push(...record.answers);
          sourceIds.push(String(record._id));
        }
        if (incompleteReason) break;
        try {
          const score = calculateSubjectScore({
            questionCount: subject.questionCount,
            marksPerQuestion: subject.marksPerQuestion,
            negativeMarksPerQuestion: subject.negativeMarksPerQuestion,
            answerKey: subject.answerKey,
            reviewedAnswers,
          });
          subjectResults.push({ subjectId: subject._id, subjectName: subject.name, ...score });
        } catch {
          incompleteReason = "incomplete_or_invalid_reviewed_answers";
          break;
        }
      }

      if (incompleteReason) {
        skipped.push({ studentId, reason: incompleteReason });
        continue;
      }

      const totalCorrect = subjectResults.reduce((sum, item) => sum + item.correctCount, 0);
      const totalIncorrect = subjectResults.reduce((sum, item) => sum + item.incorrectCount, 0);
      const totalBlank = subjectResults.reduce((sum, item) => sum + item.blankCount, 0);
      const totalMarksObtained = round2(subjectResults.reduce((sum, item) => sum + item.marksObtained, 0));
      const totalMaximumMarks = round2(subjectResults.reduce((sum, item) => sum + item.maximumMarks, 0));
      const percentage = totalMaximumMarks > 0 ? round2((totalMarksObtained / totalMaximumMarks) * 100) : 0;
      const sourceRecognitionIds = sourceIds.sort();
      const sourceHash = createHash("sha256").update(JSON.stringify({
        sourceRecognitionIds,
        student: { studentCode: student.studentCode, fullName: student.fullName, className: student.className ?? "", section: student.section ?? "", rollNumber: student.rollNumber ?? "" },
        exam: { title: exam.title, examCode: exam.examCode },
        answerKeys: exam.subjects.map((subject) => ({
          subjectId: String(subject._id),
          subjectName: subject.name,
          questionCount: subject.questionCount,
          marksPerQuestion: subject.marksPerQuestion,
          negativeMarksPerQuestion: subject.negativeMarksPerQuestion,
          answerKey: subject.answerKey,
        })),
      })).digest("hex");

      const previous = previousByStudent.get(studentId);
      if (previous?.sourceHash === sourceHash) {
        unchanged += 1;
        continue;
      }

      try {
        await ExamResult.create({
          institutionId,
          examId: examObjectId,
          examTitle: exam.title,
          examCode: exam.examCode,
          studentId: student._id,
          studentCode: student.studentCode,
          studentName: student.fullName,
          className: student.className ?? "",
          section: student.section ?? "",
          rollNumber: student.rollNumber ?? "",
          subjects: subjectResults,
          totalCorrect,
          totalIncorrect,
          totalBlank,
          totalMarksObtained,
          totalMaximumMarks,
          percentage,
          sourceRecognitionIds: sourceRecognitionIds.map((id) => new mongoose.Types.ObjectId(id)),
          sourceHash,
          revision: (previous?.revision ?? 0) + 1,
          status: "calculated",
          calculatedBy: new mongoose.Types.ObjectId(session.user.id),
          calculatedAt: new Date(),
        });
        graded += 1;
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
          const concurrentResult = await ExamResult.findOne({ institutionId, examId: examObjectId, studentId: student._id, sourceHash })
            .select("_id")
            .lean()
            .exec();
          if (concurrentResult) unchanged += 1;
          else skipped.push({ studentId, reason: "concurrent_calculation_conflict_retry" });
          continue;
        }
        throw error;
      }
    }

    return NextResponse.json({
      exam: { id: examId, title: exam.title },
      summary: { candidates: candidateIds.length, graded, unchanged, skipped: skipped.length },
      skipped,
      hasMore,
      nextCursor,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "You do not have permission to calculate results." }, { status: 403 });
    }
    console.error("Exam grading failed", error);
    return NextResponse.json({ error: "Unable to calculate results right now." }, { status: 500 });
  }
}
