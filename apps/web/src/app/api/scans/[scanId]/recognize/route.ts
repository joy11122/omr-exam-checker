import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { auth } from "@/auth";
import { readScanImage } from "@/lib/mongodb/scan-storage";
import { connectToDatabase } from "@/lib/mongodb/client";
import { getCurrentInstitution } from "@/lib/tenancy/current-institution";
import { requireInstitutionRole } from "@/lib/tenancy/authorization";
import { Exam, Recognition, Scan } from "@/models";
import { readBoundedJson } from "@/lib/http/read-bounded-json";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ scanId: string }> };

const recognitionRequestSchema = z.object({
  subjectId: z.string().regex(/^[a-f0-9]{24}$/i),
  pageNumber: z.number().int().min(0).max(14),
}).strict();

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id || !mongoose.isValidObjectId(session.user.id)) {
      return NextResponse.json({ error: "Sign in to recognize this scan." }, { status: 401 });
    }

    const { scanId } = await context.params;
    if (!mongoose.isValidObjectId(scanId)) {
      return NextResponse.json({ error: "Scan not found." }, { status: 404 });
    }

    const institution = await getCurrentInstitution(session.user.id);
    if (!institution) return NextResponse.json({ error: "Institution not found." }, { status: 403 });
    await requireInstitutionRole(institution.institutionId, "examiner");

    const body = await readBoundedJson(request, 256 * 1024);
    if (!body.ok && body.reason === "too_large") {
      return NextResponse.json({ error: "The recognition request is too large." }, { status: 413 });
    }
    if (!body.ok) {
      return NextResponse.json({ error: "Provide a valid calibrated A–D bubble layout." }, { status: 400 });
    }
    const parsed = recognitionRequestSchema.safeParse(body.value);
    if (!parsed.success) {
      return NextResponse.json({ error: "Provide a valid calibrated A–D bubble layout." }, { status: 400 });
    }

    await connectToDatabase();
    const institutionId = new mongoose.Types.ObjectId(institution.institutionId);
    const scan = await Scan.findOne({
      _id: new mongoose.Types.ObjectId(scanId),
      institutionId,
    }).select("_id imageFileId mimeType examId").lean().exec() as unknown as {
      _id: mongoose.Types.ObjectId;
      imageFileId: mongoose.Types.ObjectId;
      mimeType: string;
      examId: mongoose.Types.ObjectId | null;
    } | null;
    if (!scan) return NextResponse.json({ error: "Scan not found." }, { status: 404 });
    if (!scan.examId) {
      return NextResponse.json({ error: "Match this scan to an exam before recognizing answers." }, { status: 409 });
    }

    const exam = await Exam.findOne({ _id: scan.examId, institutionId })
      .select("subjects sheetSettings")
      .lean()
      .exec() as unknown as { subjects: Array<{ _id: mongoose.Types.ObjectId; questionCount: number; bubbleLayouts?: Array<{ pageNumber: number; bubbles: Array<{ question_number: number; option: string; x: number; y: number; radius: number }> }> }>; sheetSettings?: { questionsPerPage?: number } } | null;
    if (!exam) return NextResponse.json({ error: "The matched exam is unavailable." }, { status: 404 });
    const subject = exam.subjects.find((item) => String(item._id) === parsed.data.subjectId);
    if (!subject) return NextResponse.json({ error: "Choose a subject from the matched exam." }, { status: 404 });
    const pageLayout = subject.bubbleLayouts?.find((item) => item.pageNumber === parsed.data.pageNumber);
    if (!pageLayout?.bubbles?.length) {
      return NextResponse.json({ error: "Calibrate this subject's printed template before recognizing answers." }, { status: 409 });
    }
    const questionsPerPage = exam.sheetSettings?.questionsPerPage ?? 40;
    const firstQuestion = parsed.data.pageNumber * questionsPerPage + 1;
    const lastQuestion = Math.min(subject.questionCount, firstQuestion + questionsPerPage - 1);
    const expectedBubbleCount = (lastQuestion - firstQuestion + 1) * 4;
    if (pageLayout.bubbles.length !== expectedBubbleCount ||
        pageLayout.bubbles.some((bubble) => bubble.question_number < firstQuestion || bubble.question_number > lastQuestion)) {
      return NextResponse.json({ error: "The saved calibration does not match this exam's current sheet settings." }, { status: 409 });
    }

    const image = await readScanImage(String(scan.imageFileId));
    if (!image) return NextResponse.json({ error: "The original scan image is unavailable." }, { status: 404 });
    const engineUrl = process.env.OMR_ENGINE_URL;
    const engineKey = process.env.OMR_ENGINE_API_KEY;
    if (!engineUrl || !engineKey) {
      return NextResponse.json({ error: "The scanning service is not configured yet." }, { status: 503 });
    }

    const headers = { Authorization: `Bearer ${engineKey}` };
    const sourceFile = new Blob([new Uint8Array(image.bytes)], { type: scan.mimeType });
    const correctionForm = new FormData();
    correctionForm.set("file", sourceFile, "omr-scan");
    const correction = await fetch(new URL("/v1/scans/perspective-correction", engineUrl), {
      method: "POST",
      headers,
      body: correctionForm,
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
    if (!correction.ok) {
      const detail = await correction.json().catch(() => null) as { detail?: string } | null;
      return NextResponse.json(
        { error: detail?.detail ?? "The sheet needs alignment review before bubble recognition." },
        { status: correction.status >= 500 ? 502 : correction.status },
      );
    }

    const correctedBytes = await correction.arrayBuffer();
    const recognitionForm = new FormData();
    recognitionForm.set("file", new Blob([correctedBytes], { type: "image/jpeg" }), "corrected-sheet.jpg");
    recognitionForm.set("layout", JSON.stringify({ bubbles: pageLayout.bubbles }));
    const recognition = await fetch(new URL("/v1/scans/bubbles", engineUrl), {
      method: "POST",
      headers,
      body: recognitionForm,
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
    if (!recognition.ok) {
      return NextResponse.json({ error: "The scanning service could not read the calibrated bubble layout." }, { status: recognition.status >= 500 ? 502 : recognition.status });
    }
    const enginePayload: unknown = await recognition.json();
    const engineResultSchema = z.object({
      status: z.enum(["recognized", "review_required"]),
      question_count: z.number().int().min(1).max(80),
      summary: z.record(z.string(), z.number().int().min(0)),
      questions: z.array(z.object({
        question_number: z.number().int().min(1).max(300),
        answer: z.enum(["A", "B", "C", "D"]).nullable(),
        status: z.enum(["recognized", "blank", "multiple", "uncertain"]),
        confidence: z.number().min(0).max(1),
        options: z.array(z.object({
          option: z.enum(["A", "B", "C", "D", "E"]),
          fill_ratio: z.number().min(0).max(1),
          confidence: z.number().min(0).max(1),
        })).max(5),
      })).min(1).max(80),
    }).strict();
    const validatedResult = engineResultSchema.safeParse(enginePayload);
    if (!validatedResult.success || validatedResult.data.questions.length !== expectedBubbleCount / 4) {
      console.error("OMR engine returned an invalid recognition payload", validatedResult.success ? "question count mismatch" : validatedResult.error.flatten());
      return NextResponse.json({ error: "The scanning service returned an invalid answer set. Please retry or inspect the image manually." }, { status: 502 });
    }

    const questionNumbers = validatedResult.data.questions.map((item) => item.question_number);
    if (new Set(questionNumbers).size !== questionNumbers.length ||
        questionNumbers.some((number) => number < firstQuestion || number > lastQuestion)) {
      return NextResponse.json({ error: "The scanning service returned answers outside the calibrated page." }, { status: 502 });
    }

    const recognitionRecord = await Recognition.create({
      institutionId,
      scanId: scan._id,
      examId: scan.examId,
      subjectId: new mongoose.Types.ObjectId(parsed.data.subjectId),
      pageNumber: parsed.data.pageNumber,
      engineStatus: validatedResult.data.status,
      summary: validatedResult.data.summary,
      answers: validatedResult.data.questions.map((item) => ({
        questionNumber: item.question_number,
        detectedAnswer: item.answer,
        answer: item.answer ?? (item.status === "blank" ? "BLANK" : item.status === "multiple" ? "MULTIPLE" : "UNREADABLE"),
        detectionStatus: item.status,
        confidence: item.confidence,
        options: item.options.map((option) => ({
          option: option.option,
          fillRatio: option.fill_ratio,
          confidence: option.confidence,
        })),
      })),
      createdBy: new mongoose.Types.ObjectId(session.user.id),
      status: "pending_review",
    });

    return NextResponse.json({
      recognitionId: String(recognitionRecord._id),
      reviewStatus: recognitionRecord.status,
      result: validatedResult.data,
      calibration: { required: false, subjectId: parsed.data.subjectId, pageNumber: parsed.data.pageNumber, perspectiveCorrected: true },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "You do not have permission to recognize scans." }, { status: 403 });
    }
    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json({ error: "Bubble recognition timed out. Please try again." }, { status: 504 });
    }
    console.error("Bubble recognition request failed", error);
    return NextResponse.json({ error: "Unable to recognize this scan right now." }, { status: 500 });
  }
}
