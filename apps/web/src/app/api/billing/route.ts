import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getCurrentInstitution } from "@/lib/tenancy/current-institution";
import { requireInstitutionRole } from "@/lib/tenancy/authorization";
import { getInstitutionUsage } from "@/lib/billing/usage";
import { isPlanId } from "@/lib/billing/plans";
import { connectToDatabase } from "@/lib/mongodb/client";
import { Subscription } from "@/models/subscription";

export const runtime = "nodejs";
const requestSchema = z.object({ institutionId: z.string().regex(/^[a-f\\d]{24}$/i), plan: z.enum(["free", "growth", "enterprise"]) });

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || !mongoose.isValidObjectId(session.user.id)) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const institutionId = new URL(request.url).searchParams.get("institutionId") ?? undefined;
    const institution = await getCurrentInstitution(session.user.id, institutionId);
    if (!institution) return NextResponse.json({ error: "Institution not found." }, { status: 403 });
    await requireInstitutionRole(institution.institutionId, "admin");
    return NextResponse.json(await getInstitutionUsage(institution.institutionId), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: "Permission denied." }, { status: 403 });
    console.error("Billing summary failed", error);
    return NextResponse.json({ error: "Unable to load billing information." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || !mongoose.isValidObjectId(session.user.id)) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const origin = request.headers.get("origin");
    const expected = process.env.APP_URL ? new URL(process.env.APP_URL).origin : new URL(request.url).origin;
    if (!origin || new URL(origin).origin !== expected) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const body = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success || !isPlanId(parsed.data?.plan)) return NextResponse.json({ error: "Invalid plan request." }, { status: 400 });
    const institution = await getCurrentInstitution(session.user.id, parsed.data.institutionId);
    if (!institution) return NextResponse.json({ error: "Institution not found." }, { status: 403 });
    await requireInstitutionRole(institution.institutionId, "owner");
    await connectToDatabase();
    const tenantId = new mongoose.Types.ObjectId(institution.institutionId);
    const existing = await Subscription.findOne({ institutionId: tenantId }).exec();
    if (!existing) {
      await Subscription.create({ institutionId: tenantId, plan: "free", status: "active", requestedPlan: parsed.data.plan, requestedAt: new Date(), updatedBy: new mongoose.Types.ObjectId(session.user.id) });
    } else {
      existing.requestedPlan = parsed.data.plan;
      existing.requestedAt = new Date();
      existing.status = "pending_change";
      existing.updatedBy = new mongoose.Types.ObjectId(session.user.id);
      await existing.save();
    }
    return NextResponse.json({ message: "Plan change request recorded. No payment was taken; the request requires billing-team confirmation." }, { status: 202 });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: "Only the institution owner can request a plan change." }, { status: 403 });
    console.error("Plan change request failed", error);
    return NextResponse.json({ error: "Unable to submit plan request." }, { status: 500 });
  }
}
