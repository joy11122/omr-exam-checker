import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { getCurrentInstitution } from "@/lib/tenancy/current-institution";
import { requireInstitutionRole } from "@/lib/tenancy/authorization";
import { Recognition, Scan } from "@/models";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Sign in to view scans." }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const requestedInstitutionId = searchParams.get("institutionId") ?? undefined;
    const institution = await getCurrentInstitution(session.user.id, requestedInstitutionId);
    if (!institution) return NextResponse.json({ error: "Institution not found." }, { status: 403 });
    await requireInstitutionRole(institution.institutionId, "examiner");
    await connectToDatabase();
    const rawLimit = Number(searchParams.get("limit") ?? 25);
    const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, Math.floor(rawLimit))) : 25;
    const institutionId = new mongoose.Types.ObjectId(institution.institutionId);
    const scans = await Scan.find({ institutionId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("_id originalFilename mimeType sizeBytes image quality status createdAt examId studentId matchedAt")
      .lean()
      .exec();
    const scanIds = scans.map((scan) => scan._id);
    const recognitions = scanIds.length ? await Recognition.find({ institutionId, scanId: { $in: scanIds } })
      .sort({ createdAt: -1 })
      .select("_id scanId pageNumber engineStatus summary answers status createdAt reviewedAt")
      .lean()
      .exec() as unknown as Array<{
        _id: mongoose.Types.ObjectId;
        scanId: mongoose.Types.ObjectId;
        pageNumber: number;
        engineStatus: string;
        summary: Record<string, number>;
        answers: Array<{ questionNumber: number; detectedAnswer: string | null; answer: string; detectionStatus: string; confidence: number; options: Array<{ option: string; fillRatio: number; confidence: number }> }>;
        status: string;
        createdAt: Date;
        reviewedAt: Date | null;
      }> : [];
    const latestRecognitionByScan = new Map<string, typeof recognitions[number]>();
    for (const recognition of recognitions) {
      const key = String(recognition.scanId);
      if (!latestRecognitionByScan.has(key)) latestRecognitionByScan.set(key, recognition);
    }
    return NextResponse.json({ scans: scans.map((scan) => {
      const latest = latestRecognitionByScan.get(String(scan._id));
      return {
        id: String(scan._id),
        filename: scan.originalFilename,
        mimeType: scan.mimeType,
        sizeBytes: scan.sizeBytes,
        image: scan.image,
        quality: scan.quality,
        status: scan.status,
        createdAt: scan.createdAt,
        examId: scan.examId ? String(scan.examId) : null,
        studentId: scan.studentId ? String(scan.studentId) : null,
        matchedAt: scan.matchedAt,
        latestRecognition: latest ? {
          id: String(latest._id),
          pageNumber: latest.pageNumber,
          engineStatus: latest.engineStatus,
          summary: latest.summary,
          status: latest.status,
          createdAt: latest.createdAt,
          reviewedAt: latest.reviewedAt,
          answers: latest.answers.map((answer) => ({
            question_number: answer.questionNumber,
            answer: answer.detectedAnswer,
            status: answer.detectionStatus,
            confidence: answer.confidence,
            options: answer.options.map((option) => ({
              option: option.option,
              fill_ratio: option.fillRatio,
              confidence: option.confidence,
            })),
          })),
          reviewAnswers: latest.answers.map((answer) => ({
            questionNumber: answer.questionNumber,
            answer: answer.answer,
          })),
        } : null,
      };
    }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Scan history request failed", error);
    return NextResponse.json({ error: "Unable to load scan history right now." }, { status: 500 });
  }
}
