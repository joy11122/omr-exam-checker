import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { getCurrentInstitution } from "@/lib/tenancy/current-institution";
import { requireInstitutionRole } from "@/lib/tenancy/authorization";
import { Exam } from "@/models";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ examId: string; subjectId: string }> };

const bubbleSchema = z.object({
  question_number: z.number().int().min(1).max(300),
  option: z.enum(["A", "B", "C", "D"]),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  radius: z.number().min(0.003).max(0.05),
}).strict();

const calibrationSchema = z.object({
  pages: z.array(z.object({
    pageNumber: z.number().int().min(0).max(14),
    bubbles: z.array(bubbleSchema).min(4).max(320),
  }).strict()).min(1).max(15),
}).strict().superRefine((value, context) => {
  const pageNumbers = new Set<number>();
  for (const page of value.pages) {
    if (pageNumbers.has(page.pageNumber)) {
      context.addIssue({ code: "custom", message: "Duplicate page calibration." });
    }
    pageNumbers.add(page.pageNumber);
    const keys = new Set<string>();
    for (const bubble of page.bubbles) {
      const key = `${bubble.question_number}:${bubble.option}`;
      if (keys.has(key)) context.addIssue({ code: "custom", message: "Duplicate bubble coordinate." });
      keys.add(key);
    }
    const questions = new Map<number, Set<string>>();
    for (const bubble of page.bubbles) {
      const options = questions.get(bubble.question_number) ?? new Set<string>();
      options.add(bubble.option);
      questions.set(bubble.question_number, options);
    }
    if ([...questions.values()].some((options) => options.size !== 4)) {
      context.addIssue({ code: "custom", message: "Every question must have four calibrated options." });
    }
  }
});

export async function PUT(request: Request, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id || !mongoose.isValidObjectId(session.user.id)) {
      return NextResponse.json({ error: "Sign in to save calibration." }, { status: 401 });
    }
    const { examId, subjectId } = await context.params;
    if (!mongoose.isValidObjectId(examId) || !mongoose.isValidObjectId(subjectId)) {
      return NextResponse.json({ error: "Exam or subject not found." }, { status: 404 });
    }
    const institution = await getCurrentInstitution(session.user.id);
    if (!institution) return NextResponse.json({ error: "Institution not found." }, { status: 403 });
    await requireInstitutionRole(institution.institutionId, "teacher");

    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > 512 * 1024) {
      return NextResponse.json({ error: "Calibration data is too large." }, { status: 413 });
    }
    const body = await request.json().catch(() => null);
    const parsed = calibrationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "The calibration coordinates are invalid." }, { status: 400 });
    }

    await connectToDatabase();
    const institutionId = new mongoose.Types.ObjectId(institution.institutionId);
    const exam = await Exam.findOne({
      _id: new mongoose.Types.ObjectId(examId),
      institutionId,
    }).select("subjects sheetSettings").lean().exec() as unknown as {
      subjects: Array<{ _id: mongoose.Types.ObjectId; questionCount: number }>;
      sheetSettings?: { questionsPerPage?: number };
    } | null;
    if (!exam) return NextResponse.json({ error: "Exam not found." }, { status: 404 });
    const subject = exam.subjects.find((item) => String(item._id) === subjectId);
    if (!subject) return NextResponse.json({ error: "Subject not found." }, { status: 404 });

    const questionsPerPage = exam.sheetSettings?.questionsPerPage ?? 40;
    const expectedPageCount = Math.ceil(subject.questionCount / questionsPerPage);
    if (parsed.data.pages.length !== expectedPageCount) {
      return NextResponse.json({ error: "Calibrate every printed page before saving." }, { status: 400 });
    }
    for (const page of parsed.data.pages) {
      const firstQuestion = page.pageNumber * questionsPerPage + 1;
      const lastQuestion = Math.min(subject.questionCount, firstQuestion + questionsPerPage - 1);
      if (page.bubbles.length !== (lastQuestion - firstQuestion + 1) * 4 ||
          page.bubbles.some((bubble) => bubble.question_number < firstQuestion || bubble.question_number > lastQuestion)) {
        return NextResponse.json({ error: "The calibration does not match the printed question layout." }, { status: 400 });
      }
    }

    const pages = [...parsed.data.pages].sort((a, b) => a.pageNumber - b.pageNumber);
    const result = await Exam.updateOne(
      { _id: new mongoose.Types.ObjectId(examId), institutionId, "subjects._id": new mongoose.Types.ObjectId(subjectId) },
      { $set: { "subjects.$.bubbleLayouts": pages } },
    ).exec();
    if (result.matchedCount !== 1) return NextResponse.json({ error: "Unable to save this calibration." }, { status: 404 });
    return NextResponse.json({
      success: true,
      subjectId,
      calibratedPages: pages.length,
      calibratedQuestions: pages.reduce((total, page) => total + page.bubbles.length / 4, 0),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "You do not have permission to calibrate this exam." }, { status: 403 });
    }
    console.error("OMR bubble calibration failed", error);
    return NextResponse.json({ error: "Unable to save bubble calibration right now." }, { status: 500 });
  }
}
