import "server-only";
import mongoose from "mongoose";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { Membership, type InstitutionRole } from "@/models";

const roleRank: Record<InstitutionRole, number> = { examiner: 1, teacher: 2, admin: 3, owner: 4 };

export async function requireInstitutionRole(institutionId: string, minimumRole: InstitutionRole = "examiner") {
  const session = await auth();
  if (!session?.user?.id || !mongoose.isValidObjectId(session.user.id) || !mongoose.isValidObjectId(institutionId)) throw new Error("FORBIDDEN");
  await connectToDatabase();
  const membership = await Membership.findOne({
    institutionId: new mongoose.Types.ObjectId(institutionId),
    userId: new mongoose.Types.ObjectId(session.user.id),
  }).select("role").lean();
  if (!membership || roleRank[membership.role as InstitutionRole] < roleRank[minimumRole]) throw new Error("FORBIDDEN");
  return { userId: session.user.id, role: membership.role as InstitutionRole };
}
