import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { getCurrentInstitution } from "@/lib/tenancy/current-institution";
import { requireInstitutionRole } from "@/lib/tenancy/authorization";
import { Exam, Scan, Student } from "@/models";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ scanId: string }> };

const matchSchema = z.object({
  examId: z.string().regex(/^[a-f\\d]{24}$/i, "Choose a valid exam."),
  studentId: z.string().regex(/^[a-f\\d]{24}$/i).nullable().optional(),
});

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id || !mongoose.isValidObjectId(session.user.id)) {
      return NextResponse.json({ error: "Sign in to match this scan." }, { status: 401 });
    }

    const { scanId } = await context.params;
    if (!mongoose.isValidObjectId(scanId)) {
      return NextResponse.json({ error: "Scan not found." }, { status: 404 });
    }

    const institution = await getCurrentInstitution(session.user.id);
    if (!institution) {
      return NextResponse.json({ error: "Institution not found." }, { status: 403 });
    }
    await requireInstitutionRole(institution.institutionId, "examiner");

    const body = await request.json().catch(() => null);
    const parsed = matchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Choose a valid exam and optional student." }, { status: 400 });
    }

    await connectToDatabase();
    const institutionId = new mongoose.Types.ObjectId(institution.institutionId);
    const examId = new mongoose.Types.ObjectId(parsed.data.examId);
    const exam = await Exam.findOne({ _id: examId, institutionId })
      .select("_id title examCode status")
      .lean()
      .exec();
    if (!exam) {
      return NextResponse.json({ error: "The selected exam was not found in this institution." }, { status: 404 });
    }

    let studentId: mongoose.Types.ObjectId | null = null;
    if (parsed.data.studentId) {
      studentId = new mongoose.Types.ObjectId(parsed.data.studentId);
      const student = await Student.findOne({
        _id: studentId,
        institutionId,
        status: "active",
      }).select("_id").lean().exec();
      if (!student) {
        return NextResponse.json({ error: "The selected student was not found or is inactive." }, { status: 404 });
      }
    }

    const scan = await Scan.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(scanId), institutionId },
      {
        $set: {
          examId,
          studentId,
          matchedAt: new Date(),
          matchedBy: new mongoose.Types.ObjectId(session.user.id),
        },
      },
      { new: true, runValidators: true },
    ).select("_id examId studentId matchedAt").lean().exec();

    if (!scan) return NextResponse.json({ error: "Scan not found." }, { status: 404 });

    return NextResponse.json({
      scan: {
        id: String(scan._id),
        examId: String(scan.examId),
        studentId: scan.studentId ? String(scan.studentId) : null,
        matchedAt: scan.matchedAt,
      },
      exam: { id: String(exam._id), title: exam.title, examCode: exam.examCode },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "You do not have permission to match scans in this institution." }, { status: 403 });
    }
    console.error("Scan matching request failed", error);
    return NextResponse.json({ error: "Unable to match this scan right now." }, { status: 500 });
  }
}
