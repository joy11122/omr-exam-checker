import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/mongodb/client";
import { Institution, Membership, type InstitutionRole } from "@/models";

type InstitutionRecord = {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
};
type MembershipRecord = { institutionId: mongoose.Types.ObjectId; role: InstitutionRole };

export async function getCurrentInstitution(userId: string, requestedInstitutionId?: string) {
  if (!mongoose.isValidObjectId(userId)) return null;
  await connectToDatabase();
  const membershipQuery: Record<string, unknown> = { userId: new mongoose.Types.ObjectId(userId) };
  if (requestedInstitutionId) {
    if (!mongoose.isValidObjectId(requestedInstitutionId)) return null;
    membershipQuery.institutionId = new mongoose.Types.ObjectId(requestedInstitutionId);
  }
  const membership = await Membership.findOne(membershipQuery).sort({ createdAt: 1 }).lean().exec() as unknown as MembershipRecord | null;
  if (!membership) return null;
  const institution = await Institution.findById(membership.institutionId).lean().exec() as unknown as InstitutionRecord | null;
  if (!institution) return null;
  return { institution, role: membership.role, institutionId: String(institution._id) };
}
