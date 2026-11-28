import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { z } from "zod";
import { auth } from "@/auth";
import { getCurrentInstitution } from "@/lib/tenancy/current-institution";
import { requireInstitutionRole } from "@/lib/tenancy/authorization";
import { connectToDatabase } from "@/lib/mongodb/client";
import { deleteScanImage, storeScanImage } from "@/lib/mongodb/scan-storage";
import { Scan } from "@/models";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const intakeResultSchema = z.object({ status: z.enum(["accepted", "review_required"]), stage: z.literal("intake_validated"), sha256: z.string().regex(/^[a-f0-9]{64}$/), image: z.object({ format: z.string().max(12), width: z.number().int().positive(), height: z.number().int().positive() }), quality: z.object({ portrait: z.boolean(), contrast: z.boolean(), status: z.string().max(40) }) });

export async function POST(request: Request) {
  try {
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_UPLOAD_BYTES + 1024 * 1024) {
      return NextResponse.json({ error: "Images must be 10 MB or smaller." }, { status: 413 });
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sign in to upload an answer sheet." }, { status: 401 });
    }

    const institution = await getCurrentInstitution(session.user.id);
    if (!institution) {
      return NextResponse.json({ error: "Join an institution before uploading scans." }, { status: 403 });
    }
    await requireInstitutionRole(institution.institutionId, "examiner");

    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: "The upload request could not be read." }, { status: 400 });
    }
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose an image file to continue." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Choose a JPEG, PNG, or WebP image." }, { status: 415 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "The selected image is empty." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Images must be 10 MB or smaller." }, { status: 413 });
    }

    const engineUrl = process.env.OMR_ENGINE_URL;
    const engineKey = process.env.OMR_ENGINE_API_KEY;
    if (!engineUrl || !engineKey) {
      return NextResponse.json({ error: "The scanning service is not configured yet." }, { status: 503 });
    }

    const engineForm = new FormData();
    engineForm.set("file", file, file.name || "answer-sheet");
    const engineResponse = await fetch(
      new URL("/v1/scans/intake", engineUrl),
      {
        method: "POST",
        headers: { Authorization: `Bearer ${engineKey}` },
        body: engineForm,
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      },
    );

    if (!engineResponse.ok) {
      const safeMessages: Record<number, string> = {
        400: "The uploaded image is empty or invalid.",
        401: "The scanning service could not authenticate this request.",
        413: "The image is too large for scanning.",
        415: "Choose a valid JPEG, PNG, or WebP image.",
        422: "The image could not be read or is too small. Try a clearer photo.",
      };
      return NextResponse.json(
        { error: safeMessages[engineResponse.status] ?? "The scanning service could not process this image." },
        { status: engineResponse.status >= 500 ? 502 : engineResponse.status },
      );
    }

    const parsed = intakeResultSchema.safeParse(await engineResponse.json());
    if (!parsed.success) {
      console.error("OMR intake returned an invalid response", parsed.error.flatten());
      return NextResponse.json({ error: "The scanning service returned an invalid result." }, { status: 502 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== parsed.data.sha256) return NextResponse.json({ error: "The uploaded image fingerprint did not match the scanning result." }, { status: 502 });

    await connectToDatabase();
    const institutionId = new mongoose.Types.ObjectId(institution.institutionId);
    const existing = await Scan.findOne({ institutionId, sha256 }).lean().exec() as unknown as { _id: mongoose.Types.ObjectId; status: string; createdAt: Date } | null;
    if (existing) return NextResponse.json({ result: parsed.data, scan: { id: String(existing._id), status: existing.status, createdAt: existing.createdAt }, duplicate: true }, { status: 200, headers: { "Cache-Control": "no-store" } });

    const filename = file.name.replaceAll("/", "_").replaceAll(String.fromCharCode(92), "_").slice(0, 180) || "answer-sheet";
    const imageFileId = await storeScanImage({ bytes, filename, mimeType: file.type, institutionId: String(institutionId), sha256 });
    try {
      const scan = await Scan.create({ institutionId, createdBy: new mongoose.Types.ObjectId(session.user.id), originalFilename: filename, mimeType: file.type, sizeBytes: bytes.length, sha256, imageFileId, image: parsed.data.image, quality: parsed.data.quality, status: parsed.data.status === "accepted" ? "intake_validated" : "review_required" });
      return NextResponse.json({ result: parsed.data, scan: { id: String(scan._id), status: scan.status, createdAt: scan.createdAt }, duplicate: false }, { status: 201, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      await deleteScanImage(imageFileId).catch((cleanupError) => console.error("Failed to clean up orphaned OMR image", cleanupError));
      if (error && typeof error === "object" && "code" in error && error.code === 11000) {
        const duplicate = await Scan.findOne({ institutionId, sha256 }).lean().exec() as unknown as { _id: mongoose.Types.ObjectId; status: string; createdAt: Date } | null;
        if (duplicate) return NextResponse.json({ result: parsed.data, scan: { id: String(duplicate._id), status: duplicate.status, createdAt: duplicate.createdAt }, duplicate: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json({ error: "Image processing timed out. Please try again." }, { status: 504 });
    }
    console.error("Scan intake request failed", error);
    return NextResponse.json({ error: "Unable to process the scan right now. Please try again." }, { status: 500 });
  }
}
