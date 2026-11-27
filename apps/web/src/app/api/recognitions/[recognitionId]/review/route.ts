import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { getCurrentInstitution } from "@/lib/tenancy/current-institution";
import { requireInstitutionRole } from "@/lib/tenancy/authorization";
import { Recognition } from "@/models";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ recognitionId: string }> };

const reviewSchema = z.object({
  answers: z.array(z.object({
    questionNumber: z.number().int().min(1).max(300),
    answer: z.enum(["A", "B", "C", "D", "BLANK", "MULTIPLE", "UNREADABLE"]),
  }).strict()).min(1).max(80),
}).strict();

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id || !mongoose.isValidObjectId(session.user.id)) {
      return NextResponse.json({ error: "Sign in to review these answers." }, { status: 401 });
    }

    const { recognitionId } = await context.params;
    if (!mongoose.isValidObjectId(recognitionId)) {
      return NextResponse.json({ error: "Recognition record not found." }, { status: 404 });
    }

    const institution = await getCurrentInstitution(session.user.id);
    if (!institution) return NextResponse.json({ error: "Institution not found." }, { status: 403 });
    await requireInstitutionRole(institution.institutionId, "examiner");

    const body = await request.json().catch(() => null);
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Provide a valid answer for every question." }, { status: 400 });
    }

    await connectToDatabase();
    const institutionId = new mongoose.Types.ObjectId(institution.institutionId);
    const record = await Recognition.findOne({
      _id: new mongoose.Types.ObjectId(recognitionId),
      institutionId,
    }).exec();
    if (!record) return NextResponse.json({ error: "Recognition record not found." }, { status: 404 });
    if (record.status !== "pending_review") {
      return NextResponse.json({ error: "This answer sheet has already been reviewed and locked." }, { status: 409 });
    }

    const currentAnswers = record.answers as unknown as Array<{
      questionNumber: number;
      answer: string;
      edits: Array<{ previousAnswer: string | null; nextAnswer: string; changedBy: mongoose.Types.ObjectId; changedAt: Date }>;
    }>;
    const submitted = parsed.data.answers;
    if (submitted.length !== currentAnswers.length ||
        new Set(submitted.map((item) => item.questionNumber)).size !== submitted.length ||
        currentAnswers.some((item) => !submitted.some((answer) => answer.questionNumber === item.questionNumber))) {
      return NextResponse.json({ error: "The review must include each question exactly once." }, { status: 400 });
    }

    const reviewerId = new mongoose.Types.ObjectId(session.user.id);
    const reviewedAt = new Date();
    const answers = currentAnswers.map((current) => {
      const next = submitted.find((item) => item.questionNumber === current.questionNumber)!;
      const edits = current.edits ?? [];
      if (next.answer !== current.answer) {
        edits.push({
          previousAnswer: current.answer === "BLANK" || current.answer === "MULTIPLE" || current.answer === "UNREADABLE" ? null : current.answer,
          nextAnswer: next.answer,
          changedBy: reviewerId,
          changedAt: reviewedAt,
        });
      }
      return { questionNumber: current.questionNumber, answer: next.answer, edits };
    });

    const updated = await Recognition.findOneAndUpdate(
      { _id: record._id, institutionId, status: "pending_review" },
      { $set: { answers, status: "reviewed", reviewedBy: reviewerId, reviewedAt } },
      { new: true, runValidators: true },
    ).select("_id status reviewedAt answers").lean().exec() as unknown as {
      _id: mongoose.Types.ObjectId;
      status: string;
      reviewedAt: Date | null;
      answers: Array<{ questionNumber: number; answer: string }>;
    } | null;

    if (!updated) {
      return NextResponse.json({ error: "This answer sheet was reviewed by another examiner. Refresh before continuing." }, { status: 409 });
    }

    return NextResponse.json({
      recognition: {
        id: String(updated._id),
        status: updated.status,
        reviewedAt: updated.reviewedAt,
        answers: updated.answers,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "You do not have permission to review answers." }, { status: 403 });
    }
    console.error("OMR answer review failed", error);
    return NextResponse.json({ error: "Unable to save this answer review right now." }, { status: 500 });
  }
}
