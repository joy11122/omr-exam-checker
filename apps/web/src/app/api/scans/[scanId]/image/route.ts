import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/auth";
import { readScanImage } from "@/lib/mongodb/scan-storage";
import { connectToDatabase } from "@/lib/mongodb/client";
import { getCurrentInstitution } from "@/lib/tenancy/current-institution";
import { requireInstitutionRole } from "@/lib/tenancy/authorization";
import { Scan } from "@/models";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ scanId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Sign in to view this scan." }, { status: 401 });
    const { scanId } = await context.params;
    if (!mongoose.isValidObjectId(scanId)) return NextResponse.json({ error: "Scan not found." }, { status: 404 });
    const institution = await getCurrentInstitution(session.user.id);
    if (!institution) return NextResponse.json({ error: "Institution not found." }, { status: 403 });
    await requireInstitutionRole(institution.institutionId, "examiner");
    await connectToDatabase();
    const scan = await Scan.findOne({
      _id: new mongoose.Types.ObjectId(scanId),
      institutionId: new mongoose.Types.ObjectId(institution.institutionId),
    }).select("imageFileId mimeType originalFilename").lean().exec() as unknown as { imageFileId: mongoose.Types.ObjectId; mimeType: string; originalFilename: string } | null;
    if (!scan) return NextResponse.json({ error: "Scan not found." }, { status: 404 });
    const image = await readScanImage(String(scan.imageFileId));
    if (!image) return NextResponse.json({ error: "Scan image is unavailable." }, { status: 404 });
    return new Response(new Uint8Array(image.bytes), {
      headers: {
        "Content-Type": scan.mimeType,
        "Content-Length": String(image.length),
        "Content-Disposition": "inline; filename=\"omr-scan\"",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Private scan image request failed", error);
    return NextResponse.json({ error: "Unable to retrieve this scan image." }, { status: 500 });
  }
}
