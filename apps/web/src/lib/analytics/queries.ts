import "server-only";
import mongoose, { type PipelineStage } from "mongoose";
import { ExamResult } from "@/models/exam-result";
import { rankCandidates } from "./rankings";

const emptySummary = { candidates: 0, exams: 0, averagePercentage: 0, highestPercentage: 0, lowestPercentage: 0 };

export async function getInstitutionAnalytics(institutionId: string, examId?: string) {
  if (!mongoose.isValidObjectId(institutionId)) throw new Error("INVALID_INSTITUTION");
  if (examId && !mongoose.isValidObjectId(examId)) throw new Error("INVALID_EXAM");
  const tenantId = new mongoose.Types.ObjectId(institutionId);
  const examObjectId = examId ? new mongoose.Types.ObjectId(examId) : null;
  const latestPublished: PipelineStage[] = [
    { $match: { institutionId: tenantId, publicationStatus: "published" } },
    { $sort: { examId: 1, studentId: 1, revision: -1, calculatedAt: -1, _id: -1 } },
    { $group: { _id: { examId: "$examId", studentId: "$studentId" }, result: { $first: "$$ROOT" } } },
    { $replaceRoot: { newRoot: "$result" } },
  ];

  const institutionPipeline: PipelineStage[] = [
      ...latestPublished,
      { $facet: {
        summary: [{ $group: {
          _id: null, candidates: { $sum: 1 }, averagePercentage: { $avg: "$percentage" },
          highestPercentage: { $max: "$percentage" }, lowestPercentage: { $min: "$percentage" },
          exams: { $addToSet: "$examId" },
        } }],
        byExam: [
          { $group: {
            _id: "$examId", examTitle: { $first: "$examTitle" }, examCode: { $first: "$examCode" },
            candidates: { $sum: 1 }, averagePercentage: { $avg: "$percentage" },
            highestPercentage: { $max: "$percentage" }, lowestPercentage: { $min: "$percentage" },
          } },
          { $sort: { examTitle: 1 } },
        ],
        classPerformance: [
          { $match: { className: { $nin: ["", null] } } },
          { $group: {
            _id: { className: "$className", section: "$section" },
            candidates: { $sum: 1 }, averagePercentage: { $avg: "$percentage" },
            highestPercentage: { $max: "$percentage" },
          } },
          { $sort: { "_id.className": 1, "_id.section": 1 } },
        ],
        subjectPerformance: [
          { $unwind: "$subjects" },
          { $group: {
            _id: "$subjects.subjectName", candidates: { $sum: 1 },
            averagePercentage: { $avg: "$subjects.percentage" },
            averageMarks: { $avg: "$subjects.marksObtained" },
            correct: { $sum: "$subjects.correctCount" },
            incorrect: { $sum: "$subjects.incorrectCount" },
            blank: { $sum: "$subjects.blankCount" },
          } },
          { $sort: { averagePercentage: -1, _id: 1 } },
        ],
      } },
    ];
  const selectedPipeline: PipelineStage[] = examObjectId ? [
      ...latestPublished,
      { $match: { examId: examObjectId } },
      { $facet: {
        total: [{ $count: "count" }],
        candidates: [
          { $sort: { percentage: -1, totalMarksObtained: -1, studentCode: 1, studentId: 1 } },
          { $limit: 1000 },
          { $project: {
            studentId: { $toString: "$studentId" }, studentCode: 1, studentName: 1,
            className: 1, section: 1, totalMarksObtained: 1, totalMaximumMarks: 1, percentage: 1,
          } },
        ],
      } },
    ] : [];

  const [facets, selectedData] = await Promise.all([
    ExamResult.aggregate(institutionPipeline).exec(),
    examObjectId ? ExamResult.aggregate(selectedPipeline).exec() : Promise.resolve([]),
  ]);

  const data = (facets[0] ?? {}) as {
    summary?: Array<Record<string, unknown>>;
    byExam?: Array<Record<string, unknown>>;
    classPerformance?: Array<Record<string, unknown>>;
    subjectPerformance?: Array<Record<string, unknown>>;
  };
  const summaryRow = data.summary?.[0] ?? {};
  const summary = Number(summaryRow.candidates ?? 0) ? {
    candidates: Number(summaryRow.candidates),
    exams: Array.isArray(summaryRow.exams) ? summaryRow.exams.length : 0,
    averagePercentage: Number(summaryRow.averagePercentage ?? 0),
    highestPercentage: Number(summaryRow.highestPercentage ?? 0),
    lowestPercentage: Number(summaryRow.lowestPercentage ?? 0),
  } : emptySummary;

  const selected = (selectedData[0] ?? {}) as { total?: Array<{count:number}>; candidates?: Array<Record<string,unknown>> };
  const selectedRows = selected.candidates ?? [];
  const rankings = rankCandidates(selectedRows.map((row) => ({
    studentId: String(row.studentId), studentCode: String(row.studentCode ?? ""),
    studentName: String(row.studentName ?? ""), className: String(row.className ?? ""),
    section: String(row.section ?? ""), totalMarksObtained: Number(row.totalMarksObtained ?? 0),
    totalMaximumMarks: Number(row.totalMaximumMarks ?? 0), percentage: Number(row.percentage ?? 0),
  }))).slice(0, 100);

  return {
    summary,
    byExam: (data.byExam ?? []).map((row) => ({
      examId: String(row._id), examTitle: String(row.examTitle ?? ""), examCode: String(row.examCode ?? ""),
      candidates: Number(row.candidates ?? 0), averagePercentage: Number(row.averagePercentage ?? 0),
      highestPercentage: Number(row.highestPercentage ?? 0), lowestPercentage: Number(row.lowestPercentage ?? 0),
    })),
    classPerformance: (data.classPerformance ?? []).map((row) => {
      const group = row._id as { className?: string; section?: string };
      return { className: group.className ?? "Unassigned", section: group.section ?? "",
        candidates: Number(row.candidates ?? 0), averagePercentage: Number(row.averagePercentage ?? 0),
        highestPercentage: Number(row.highestPercentage ?? 0) };
    }),
    subjectPerformance: (data.subjectPerformance ?? []).map((row) => ({
      subjectName: String(row._id ?? ""), candidates: Number(row.candidates ?? 0),
      averagePercentage: Number(row.averagePercentage ?? 0), averageMarks: Number(row.averageMarks ?? 0),
      correct: Number(row.correct ?? 0), incorrect: Number(row.incorrect ?? 0), blank: Number(row.blank ?? 0),
    })),
    rankings,
    rankingCandidateCount: Number(selected.total?.[0]?.count ?? 0),
    rankingTruncated: Number(selected.total?.[0]?.count ?? 0) > 1000,
  };
}
