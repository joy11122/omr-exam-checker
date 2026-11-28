import { createHash } from "node:crypto";
import mongoose, { type PipelineStage } from "mongoose";
import { NextResponse } from "next/server";
import { checkRequestRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { getCurrentInstitution } from "@/lib/tenancy/current-institution";
import { requireInstitutionRole } from "@/lib/tenancy/authorization";
import { Exam, Student } from "@/models";
import { ExamResult } from "@/models/exam-result";
import { createStudentMagicLinkToken } from "@/lib/student-portal/access";
import { sendStudentResultEmail } from "@/lib/student-portal/email";
import { StudentPortalToken } from "@/models/student-portal-token";

export const runtime = "nodejs";
export const maxDuration = 60;

type Context = { params: Promise<{ examId: string }> };
type ResultRecord = {
  _id: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  studentName: string;
  examTitle: string;
  examCode: string;
  publicationStatus?: "draft" | "published";
  publishedAt?: Date | null;
  notificationStatus?: string;
};
type StudentRecord = { _id: mongoose.Types.ObjectId; email?: string };

async function processWithConcurrency<T>(items: T[], concurrency: number, handler: (item: T) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await handler(items[index]);
    }
  });
  await Promise.all(workers);
}

function latestResultsPipeline(institutionId: mongoose.Types.ObjectId, examId: mongoose.Types.ObjectId): PipelineStage[] {
  return [
    { $match: { institutionId, examId } },
    { $sort: { revision: -1, calculatedAt: -1 } },
    { $group: { _id: "$studentId", result: { $first: "$$ROOT" } } },
    { $replaceRoot: { newRoot: "$result" } },
  ];
}

function hasValidEmail(email: string | undefined) {
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

export async function POST(request: Request, context: Context) {
  const rateLimit = rateLimitResponse(await checkRequestRateLimit(request, { scope: "exam:publish", limit: 5, windowMs: 10 * 60 * 1000 }));
  if (rateLimit) return rateLimit;

  try {
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (!origin || !host) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    try { if (new URL(origin).host !== host) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 }); }
    catch { return NextResponse.json({ error: "Invalid request origin." }, { status: 403 }); }

    const session = await auth();
    if (!session?.user?.id || !mongoose.isValidObjectId(session.user.id)) {
      return NextResponse.json({ error: "Sign in to publish results." }, { status: 401 });
    }
    const { examId } = await context.params;
    if (!mongoose.isValidObjectId(examId)) return NextResponse.json({ error: "Exam not found." }, { status: 404 });
    const { searchParams } = new URL(request.url);
    const afterResultId = searchParams.get("afterResultId");
    const preflight = searchParams.get("preflight") === "1";
    if (afterResultId && !mongoose.isValidObjectId(afterResultId)) {
      return NextResponse.json({ error: "Invalid publication cursor." }, { status: 400 });
    }

    const institution = await getCurrentInstitution(session.user.id);
    if (!institution) return NextResponse.json({ error: "Institution not found." }, { status: 403 });
    await requireInstitutionRole(institution.institutionId, "examiner");
    await connectToDatabase();

    const institutionId = new mongoose.Types.ObjectId(institution.institutionId);
    const examObjectId = new mongoose.Types.ObjectId(examId);
    const exam = await Exam.findOne({ _id: examObjectId, institutionId }).select("_id title").lean().exec() as unknown as { _id: mongoose.Types.ObjectId; title: string } | null;
    if (!exam) return NextResponse.json({ error: "Exam not found in this institution." }, { status: 404 });
    if (!process.env.RESEND_API_KEY || !process.env.RESULTS_FROM_EMAIL) {
      return NextResponse.json({ error: "Configure RESEND_API_KEY and RESULTS_FROM_EMAIL before publishing student results." }, { status: 503 });
    }

    const appUrl = process.env.APP_URL || process.env.AUTH_URL || new URL(request.url).origin;
    let parsedAppUrl: URL;
    try { parsedAppUrl = new URL(appUrl); } catch {
      return NextResponse.json({ error: "APP_URL must be a valid absolute URL." }, { status: 500 });
    }
    if (process.env.NODE_ENV === "production" && parsedAppUrl.protocol !== "https:") {
      return NextResponse.json({ error: "APP_URL must use HTTPS in production." }, { status: 500 });
    }

    const basePipeline = latestResultsPipeline(institutionId, examObjectId);
    if (preflight) {
      const candidates = await ExamResult.aggregate([
        ...basePipeline,
        { $project: { studentId: 1 } },
        { $limit: 10001 },
      ]).exec() as Array<{ studentId: mongoose.Types.ObjectId }>;
      if (!candidates.length) return NextResponse.json({ error: "Calculate at least one candidate result before publishing." }, { status: 409 });
      if (candidates.length > 10000) return NextResponse.json({ error: "This exam has more than 10,000 candidates. Publish by class or section in a later release." }, { status: 413 });
      const ids = candidates.map((item) => item.studentId);
      const students = await Student.find({ _id: { $in: ids }, institutionId }).select("_id email").lean().exec() as unknown as StudentRecord[];
      const emailById = new Map(students.map((student) => [String(student._id), student.email]));
      const missingEmailCount = candidates.filter((item) => !hasValidEmail(emailById.get(String(item.studentId)))).length;
      if (missingEmailCount) {
        return NextResponse.json({
          error: `Add a valid email address to ${missingEmailCount} student record(s) before publishing. No results have been published.`,
          missingEmailCount,
        }, { status: 409 });
      }
      return NextResponse.json({ ready: true, candidates: candidates.length }, { headers: { "Cache-Control": "no-store" } });
    }

    const pipeline = [...basePipeline];
    if (afterResultId) pipeline.push({ $match: { _id: { $gt: new mongoose.Types.ObjectId(afterResultId) } } });
    pipeline.push({ $sort: { _id: 1 } }, { $limit: 21 });
    const results = await ExamResult.aggregate(pipeline).exec() as ResultRecord[];
    const hasMore = results.length > 20;
    const batch = results.slice(0, 20);
    const nextCursor = hasMore && batch.length ? String(batch[batch.length - 1]._id) : null;
    if (!batch.length) {
      return NextResponse.json({ exam: { id: examId, title: exam.title }, summary: { published: 0, emailsSent: 0, emailFailed: 0 }, hasMore: false, nextCursor: null });
    }

    const studentIds = [...new Set(batch.map((result) => String(result.studentId)))].map((id) => new mongoose.Types.ObjectId(id));
    const students = await Student.find({ _id: { $in: studentIds }, institutionId }).select("_id email").lean().exec() as unknown as StudentRecord[];
    const studentById = new Map(students.map((student) => [String(student._id), student]));
    const missingEmailCount = batch.filter((result) => !hasValidEmail(studentById.get(String(result.studentId))?.email)).length;
    if (missingEmailCount) {
      return NextResponse.json({ error: "A student email changed after preflight. No results in this batch were published; update the roster and run publication again." }, { status: 409 });
    }

    const now = new Date();
    await ExamResult.bulkWrite(batch.map((result) => {
      const fields: Record<string, unknown> = {
        publicationStatus: "published",
        publishedBy: new mongoose.Types.ObjectId(session.user.id),
      };
      if (result.publicationStatus !== "published" || !result.publishedAt) fields.publishedAt = now;
      return {
        updateOne: {
          filter: { _id: result._id, institutionId, examId: examObjectId },
          update: { $set: fields },
        },
      };
    }), { ordered: false });

    const summary = { published: batch.length, emailsSent: 0, emailFailed: 0 };
    await processWithConcurrency(batch, 5, async (result) => {
      if (result.publicationStatus === "published" && result.notificationStatus === "sent") return;
      const email = studentById.get(String(result.studentId))?.email;
      if (!email) return;
      let magicToken: string | null = null;
      try {
        magicToken = await createStudentMagicLinkToken(institution.institutionId, String(result.studentId));
        const accessUrl = new URL("/student/access/" + magicToken, parsedAppUrl).toString();
        const delivery = await sendStudentResultEmail({ to: email, studentName: result.studentName, examTitle: result.examTitle, examCode: result.examCode, accessUrl });
        if (!delivery.sent) throw new Error("Email provider is not configured.");
        summary.emailsSent += 1;
        await ExamResult.updateOne({ _id: result._id, institutionId }, { $set: { notificationStatus: "sent", notificationSentAt: new Date() } });
      } catch (error) {
        if (magicToken) {
          await StudentPortalToken.deleteOne({ tokenHash: createHash("sha256").update(magicToken).digest("hex"), purpose: "magic_link" });
        }
        summary.emailFailed += 1;
        await ExamResult.updateOne({ _id: result._id, institutionId }, { $set: { notificationStatus: "failed" } });
        console.error("Student result notification failed", { resultId: String(result._id), error });
      }
    });

    return NextResponse.json({ exam: { id: examId, title: exam.title }, summary, hasMore, nextCursor }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "You do not have permission to publish results." }, { status: 403 });
    }
    console.error("Exam result publication failed", error);
    return NextResponse.json({ error: "Unable to publish results right now." }, { status: 500 });
  }
}
