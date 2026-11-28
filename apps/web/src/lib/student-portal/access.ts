import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/mongodb/client";
import { StudentPortalToken } from "@/models/student-portal-token";

export const STUDENT_SESSION_COOKIE = "omr_student_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createStudentMagicLinkToken(institutionId: string, studentId: string) {
  await connectToDatabase();
  const token = randomBytes(32).toString("hex");
  await StudentPortalToken.create({
    tokenHash: hashToken(token),
    purpose: "magic_link",
    institutionId: new mongoose.Types.ObjectId(institutionId),
    studentId: new mongoose.Types.ObjectId(studentId),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });
  return token;
}

export async function exchangeStudentMagicLink(token: string) {
  if (!/^[a-f0-9]{64}$/i.test(token)) return null;
  await connectToDatabase();
  const consumed = await StudentPortalToken.findOneAndUpdate({
    tokenHash: hashToken(token),
    purpose: "magic_link",
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  }, { $set: { consumedAt: new Date() } }, { new: true })
    .select("_id institutionId studentId")
    .lean()
    .exec() as { _id: mongoose.Types.ObjectId; institutionId: mongoose.Types.ObjectId; studentId: mongoose.Types.ObjectId } | null;
  if (!consumed) return null;

  const sessionToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  try {
    await StudentPortalToken.create({
      tokenHash: hashToken(sessionToken),
      purpose: "session",
      institutionId: consumed.institutionId,
      studentId: consumed.studentId,
      expiresAt,
    });
    return { token: sessionToken, expiresAt };
  } catch (error) {
    await StudentPortalToken.updateOne({ _id: consumed._id, purpose: "magic_link" }, { $set: { consumedAt: null } });
    throw error;
  }
}

export async function getStudentPortalSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(STUDENT_SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) return null;
  await connectToDatabase();
  const session = await StudentPortalToken.findOne({
    tokenHash: hashToken(token),
    purpose: "session",
    expiresAt: { $gt: new Date() },
  }).select("institutionId studentId").lean().exec() as {
    institutionId: mongoose.Types.ObjectId;
    studentId: mongoose.Types.ObjectId;
  } | null;
  if (!session) return null;
  return { institutionId: String(session.institutionId), studentId: String(session.studentId) };
}

export const studentSessionMaxAge = SESSION_MAX_AGE_SECONDS;
