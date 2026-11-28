import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { getCurrentInstitution } from "@/lib/tenancy/current-institution";
import { requireInstitutionRole } from "@/lib/tenancy/authorization";
import { ExamResult } from "@/models/exam-result";

export const runtime = "nodejs";

function csvCell(value: unknown) {
  const raw = String(value ?? "");
  const first = raw.charCodeAt(0);
  const safe = [61, 43, 45, 64, 9, 13].includes(first) ? "'" + raw : raw;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || !mongoose.isValidObjectId(session.user.id)) {
      return NextResponse.json({ error: "Sign in to export analytics." }, { status: 401 });
    }
    const params = new URL(request.url).searchParams;
    const institutionId = params.get("institutionId") ?? undefined;
    const examId = params.get("examId");
    if (examId && !mongoose.isValidObjectId(examId)) return NextResponse.json({ error: "Invalid exam." }, { status: 400 });
    const institution = await getCurrentInstitution(session.user.id, institutionId);
    if (!institution) return NextResponse.json({ error: "Institution not found." }, { status: 403 });
    await requireInstitutionRole(institution.institutionId, "examiner");
    await connectToDatabase();
    const match: Record<string, unknown> = {
      institutionId: new mongoose.Types.ObjectId(institution.institutionId),
      publicationStatus: "published",
    };
    if (examId) match.examId = new mongoose.Types.ObjectId(examId);
    const rows = await ExamResult.aggregate([
      { $match: match },
      { $sort: { examId: 1, studentId: 1, revision: -1, calculatedAt: -1, _id: -1 } },
      { $group: { _id: { examId: "$examId", studentId: "$studentId" }, result: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$result" } },
      { $sort: { examTitle: 1, percentage: -1, totalMarksObtained: -1, studentCode: 1 } },
      { $limit: 10001 },
      { $project: {
        examTitle: 1, examCode: 1, studentCode: 1, studentName: 1, className: 1,
        section: 1, rollNumber: 1, totalMarksObtained: 1, totalMaximumMarks: 1,
        percentage: 1, totalCorrect: 1, totalIncorrect: 1, totalBlank: 1,
        revision: 1, publishedAt: 1,
      } },
    ]).exec() as Array<Record<string, unknown>>;
    if (rows.length > 10000) return NextResponse.json({ error: "Export exceeds 10,000 rows. Filter to one exam and retry." }, { status: 413 });
    const header = ["Exam","Exam code","Student code","Student name","Class","Section","Roll","Marks","Maximum marks","Percentage","Correct","Incorrect","Blank","Revision","Published at"];
    const lines = [header, ...rows.map((row) => [
      row.examTitle,row.examCode,row.studentCode,row.studentName,row.className,row.section,
      row.rollNumber,row.totalMarksObtained,row.totalMaximumMarks,Number(row.percentage ?? 0).toFixed(2),
      row.totalCorrect,row.totalIncorrect,row.totalBlank,row.revision,
      row.publishedAt ? new Date(String(row.publishedAt)).toISOString() : "",
    ])].map((line) => line.map(csvCell).join(","));
    return new Response("\uFEFF" + lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="omr-published-results.csv"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "You do not have permission to export this report." }, { status: 403 });
    }
    console.error("Analytics export failed", error);
    return NextResponse.json({ error: "Unable to export analytics right now." }, { status: 500 });
  }
}
