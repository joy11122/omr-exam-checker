import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCurrentInstitution } from "@/lib/tenancy/current-institution";
import { requireInstitutionRole } from "@/lib/tenancy/authorization";

export const runtime = "nodejs";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  try {
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_UPLOAD_BYTES + 1024 * 1024) return NextResponse.json({ error: "Images must be 10 MB or smaller." }, { status: 413 });
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Sign in to inspect an answer sheet." }, { status: 401 });
    const institution = await getCurrentInstitution(session.user.id);
    if (!institution) return NextResponse.json({ error: "Join an institution before processing scans." }, { status: 403 });
    await requireInstitutionRole(institution.institutionId, "examiner");
    const formData = await request.formData().catch(() => null);
    const file = formData?.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image file to continue." }, { status: 400 });
    if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: "Choose a JPEG, PNG, or WebP image." }, { status: 415 });
    if (file.size === 0) return NextResponse.json({ error: "The selected image is empty." }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Images must be 10 MB or smaller." }, { status: 413 });
    const engineUrl = process.env.OMR_ENGINE_URL;
    const engineKey = process.env.OMR_ENGINE_API_KEY;
    if (!engineUrl || !engineKey) return NextResponse.json({ error: "The scanning service is not configured yet." }, { status: 503 });
    const engineForm = new FormData();
    engineForm.set("file", file, file.name || "answer-sheet");
    const upstream = await fetch(new URL("/v1/scans/registration-marks", engineUrl), {
      method: "POST",
      headers: { Authorization: `Bearer ${engineKey}` },
      body: engineForm,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!upstream.ok) {
      const messages: Record<number, string> = {
        401: "The scanning service could not authenticate this request.",
        413: "The image is too large for scanning.",
        415: "Choose a valid JPEG, PNG, or WebP image.",
        422: "The image could not be read. Try a clearer photo.",
      };
      return NextResponse.json({ error: messages[upstream.status] ?? "The scanning service could not inspect this image." }, { status: upstream.status >= 500 ? 502 : upstream.status });
    }
    const result: unknown = await upstream.json();
    return NextResponse.json({ result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") return NextResponse.json({ error: "Image processing timed out. Please try again." }, { status: 504 });
    console.error("Scan registration-mark inspection failed", error);
    return NextResponse.json({ error: "Unable to inspect registration marks right now. Please try again." }, { status: 500 });
  }
}
