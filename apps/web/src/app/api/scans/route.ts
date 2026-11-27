import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { getCurrentInstitution } from "@/lib/tenancy/current-institution";
import { requireInstitutionRole } from "@/lib/tenancy/authorization";
import { Scan } from "@/models";

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
    const scans = await Scan.find({ institutionId: new mongoose.Types.ObjectId(institution.institutionId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("_id originalFilename mimeType sizeBytes image quality status createdAt examId studentId matchedAt")
      .lean()
      .exec();
    return NextResponse.json({ scans: scans.map((scan) => ({
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
    })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Scan history request failed", error);
    return NextResponse.json({ error: "Unable to load scan history right now." }, { status: 500 });
  }
}
