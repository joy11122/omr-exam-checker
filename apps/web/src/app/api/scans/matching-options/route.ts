import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { getCurrentInstitution } from "@/lib/tenancy/current-institution";
import { requireInstitutionRole } from "@/lib/tenancy/authorization";
import { Exam, Student } from "@/models";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id || !mongoose.isValidObjectId(session.user.id)) {
      return NextResponse.json({ error: "Sign in to load matching options." }, { status: 401 });
    }
    const institution = await getCurrentInstitution(session.user.id);
    if (!institution) return NextResponse.json({ error: "Institution not found." }, { status: 403 });
    await requireInstitutionRole(institution.institutionId, "examiner");
    await connectToDatabase();
    const institutionId = new mongoose.Types.ObjectId(institution.institutionId);
    const [exams, students] = await Promise.all([
      Exam.find({ institutionId }).sort({ createdAt: -1 }).limit(100).select("_id title examCode status sheetSettings.questionsPerPage subjects.name subjects.questionCount subjects.bubbleLayouts.pageNumber").lean().exec(),
      Student.find({ institutionId, status: "active" }).sort({ fullName: 1 }).limit(300).select("_id fullName studentCode className rollNumber").lean().exec(),
    ]);
    return NextResponse.json({
      exams: exams.map((exam: {
        _id: mongoose.Types.ObjectId;
        title: string;
        examCode: string;
        status: string;
        sheetSettings?: { questionsPerPage?: number };
        subjects: Array<{
          _id: mongoose.Types.ObjectId;
          name: string;
          questionCount: number;
          bubbleLayouts?: Array<{ pageNumber: number }>;
        }>;
      }) => ({
        id: String(exam._id),
        title: exam.title,
        examCode: exam.examCode,
        status: exam.status,
        questionsPerPage: exam.sheetSettings?.questionsPerPage ?? 40,
        subjects: exam.subjects.map((subject) => ({
          id: String(subject._id),
          name: subject.name,
          questionCount: subject.questionCount,
          calibratedPages: (subject.bubbleLayouts ?? []).map((page) => page.pageNumber),
        })),
      })),
      students: students.map((student) => ({ id: String(student._id), name: student.fullName, studentCode: student.studentCode, className: student.className, rollNumber: student.rollNumber })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "You do not have permission to match scans." }, { status: 403 });
    }
    console.error("Scan matching options request failed", error);
    return NextResponse.json({ error: "Unable to load matching options." }, { status: 500 });
  }
}
