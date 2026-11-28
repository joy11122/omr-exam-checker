import { NextResponse } from "next/server";
import { checkRequestRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
import mongoose from "mongoose";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { getCurrentInstitution } from "@/lib/tenancy/current-institution";
import { requireInstitutionRole } from "@/lib/tenancy/authorization";
import { ExamResult } from "@/models/exam-result";

export const runtime = "nodejs";

function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (typeof value === "string" && /^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export async function GET(request: Request) {
  const rateLimit = rateLimitResponse(await checkRequestRateLimit(request, { scope: "results:export", limit: 20, windowMs: 10 * 60 * 1000 }));
  if (rateLimit) return rateLimit;

  try {
    const session = await auth();
    if (!session?.user?.id || !mongoose.isValidObjectId(session.user.id)) {
      return NextResponse.json({ error: "Sign in to export results." }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const examId = searchParams.get("examId");
    if (examId && !mongoose.isValidObjectId(examId)) {
      return NextResponse.json({ error: "Invalid exam selection." }, { status: 400 });
    }
    const institution = await getCurrentInstitution(session.user.id);
    if (!institution) return NextResponse.json({ error: "Institution not found." }, { status: 403 });
    await requireInstitutionRole(institution.institutionId, "examiner");
    await connectToDatabase();

    const match: Record<string, unknown> = { institutionId: new mongoose.Types.ObjectId(institution.institutionId) };
    if (examId) match.examId = new mongoose.Types.ObjectId(examId);
    const latest = await ExamResult.aggregate([
      { $match: match },
      { $sort: { revision: -1, calculatedAt: -1 } },
      { $group: { _id: { examId: "$examId", studentId: "$studentId" }, result: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$result" } },
      { $sort: { examTitle: 1, studentName: 1 } },
      { $limit: 5000 },
    ]).exec();

    const rows = [
      ["Exam", "Exam code", "Student code", "Student name", "Class", "Section", "Roll", "Correct", "Incorrect", "Blank", "Marks obtained", "Maximum marks", "Percentage", "Revision", "Calculated at"],
      ...latest.map((result) => [
        result.examTitle, result.examCode, result.studentCode, result.studentName,
        result.className, result.section, result.rollNumber, result.totalCorrect,
        result.totalIncorrect, result.totalBlank, result.totalMarksObtained,
        result.totalMaximumMarks, result.percentage, result.revision,
        new Date(result.calculatedAt).toISOString(),
      ]),
    ];
    const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const suffix = examId ? examId.slice(-8) : "all";
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="omr-results-${suffix}.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "You do not have permission to export results." }, { status: 403 });
    }
    console.error("Result export failed", error);
    return NextResponse.json({ error: "Unable to export results right now." }, { status: 500 });
  }
}
