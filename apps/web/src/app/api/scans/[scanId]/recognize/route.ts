import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { auth } from "@/auth";
import { readScanImage } from "@/lib/mongodb/scan-storage";
import { connectToDatabase } from "@/lib/mongodb/client";
import { getCurrentInstitution } from "@/lib/tenancy/current-institution";
import { requireInstitutionRole } from "@/lib/tenancy/authorization";
import { Exam, Scan } from "@/models";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ scanId: string }> };

const bubbleLayoutSchema = z.object({
  subjectId: z.string().regex(/^[a-f0-9]{24}$/i),
  bubbles: z.array(z.object({
    question_number: z.number().int().min(1).max(300),
    option: z.enum(["A", "B", "C", "D"]),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    radius: z.number().min(0.003).max(0.05),
  }).strict()).min(4).max(1200),
}).strict().superRefine((layout, context) => {
  const groups = new Map<number, Set<string>>();
  for (const bubble of layout.bubbles) {
    const options = groups.get(bubble.question_number) ?? new Set<string>();
    if (options.has(bubble.option)) {
      context.addIssue({ code: "custom", message: "Duplicate option in question layout." });
    }
    options.add(bubble.option);
    groups.set(bubble.question_number, options);
  }
  for (const options of groups.values()) {
    if (options.size !== 4) {
      context.addIssue({ code: "custom", message: "Every question must have A, B, C and D bubbles." });
    }
  }
});

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

    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > 256 * 1024) {
      return NextResponse.json({ error: "The calibration layout is too large." }, { status: 413 });
    }
    const body = await request.json().catch(() => null);
    const parsed = bubbleLayoutSchema.safeParse(body);
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
      .select("subjects")
      .lean()
      .exec() as unknown as { subjects: Array<{ _id: mongoose.Types.ObjectId; questionCount: number }> } | null;
    if (!exam) return NextResponse.json({ error: "The matched exam is unavailable." }, { status: 404 });
    const subject = exam.subjects.find((item) => String(item._id) === parsed.data.subjectId);
    if (!subject) return NextResponse.json({ error: "Choose a subject from the matched exam." }, { status: 404 });
    if (parsed.data.bubbles.some((bubble) => bubble.question_number > subject.questionCount)) {
      return NextResponse.json({ error: "The layout contains a question outside this subject." }, { status: 400 });
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
    recognitionForm.set("layout", JSON.stringify({ bubbles: parsed.data.bubbles }));
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
    const result: unknown = await recognition.json();
    return NextResponse.json({
      result,
      calibration: { required: true, subjectId: parsed.data.subjectId, perspectiveCorrected: true },
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
