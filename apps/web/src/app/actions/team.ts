"use server";
import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import mongoose from "mongoose";
import { auth } from "@/auth";
import { requireInstitutionRole } from "@/lib/tenancy/authorization";
import { connectToDatabase } from "@/lib/mongodb/client";
import { Invitation, Membership, User } from "@/models";
import { invitationSchema, membershipRoleSchema, removeMemberSchema } from "@/lib/validations/phase-two";

export async function createTeamInvitation(formData: FormData) {
  const parsed = invitationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/team?error=invalid_invitation");
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  let rawToken = "";
  try {
    await requireInstitutionRole(parsed.data.institutionId, parsed.data.role === "admin" ? "owner" : "admin");
    await connectToDatabase();
    const existingUser = await User.findOne({ email: parsed.data.email }).select("_id");
    if (existingUser) {
      const existingMembership = await Membership.findOne({ institutionId: parsed.data.institutionId, userId: existingUser._id });
      if (existingMembership) redirect("/team?error=already_member");
    }
    rawToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    await Invitation.create({
      institutionId: parsed.data.institutionId,
      email: parsed.data.email,
      role: parsed.data.role,
      invitedBy: new mongoose.Types.ObjectId(session.user.id),
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/team?error=forbidden");
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    redirect("/team?error=invite_failed");
  }
  revalidatePath("/team");
  redirect(`/team?institutionId=${parsed.data.institutionId}&invite=${encodeURIComponent(rawToken)}`);
}

export async function updateMemberRole(formData: FormData) {
  const parsed = membershipRoleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || parsed.data.role === "owner") redirect("/team?error=invalid_role");
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  try {
    await requireInstitutionRole(parsed.data.institutionId, "owner");
    await connectToDatabase();
    const member = await Membership.findOne({ _id: parsed.data.membershipId, institutionId: parsed.data.institutionId });
    if (!member || member.role === "owner") redirect("/team?error=protected_owner");
    member.role = parsed.data.role;
    await member.save();
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/team?error=forbidden");
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    redirect("/team?error=role_update_failed");
  }
  revalidatePath("/team");
  redirect(`/team?institutionId=${parsed.data.institutionId}&updated=1`);
}

export async function removeTeamMember(formData: FormData) {
  const parsed = removeMemberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/team?error=invalid_member");
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  try {
    await requireInstitutionRole(parsed.data.institutionId, "owner");
    await connectToDatabase();
    const member = await Membership.findOne({ _id: parsed.data.membershipId, institutionId: parsed.data.institutionId });
    if (!member || member.role === "owner" || String(member.userId) === session.user.id) redirect("/team?error=protected_owner");
    await member.deleteOne();
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/team?error=forbidden");
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    redirect("/team?error=remove_failed");
  }
  revalidatePath("/team");
  redirect(`/team?institutionId=${parsed.data.institutionId}&removed=1`);
}

export async function acceptTeamInvitation(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) redirect("/login?error=invalid_invitation");
  const session = await auth();
  if (!session?.user?.id || !session.user.email || !mongoose.isValidObjectId(session.user.id)) redirect("/login");
  await connectToDatabase();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const mongoSession = await mongoose.startSession();
  let institutionId = "";
  try {
    await mongoSession.withTransaction(async () => {
      const invitation = await Invitation.findOne({
        tokenHash,
        acceptedAt: null,
        expiresAt: { $gt: new Date() },
        email: session.user.email!.toLowerCase(),
      }).session(mongoSession);
      if (!invitation) throw new Error("INVITATION_INVALID");
      institutionId = String(invitation.institutionId);
      await Membership.updateOne(
        { institutionId: invitation.institutionId, userId: new mongoose.Types.ObjectId(session.user.id) },
        { $setOnInsert: { role: invitation.role } },
        { upsert: true, session: mongoSession },
      );
      invitation.acceptedAt = new Date();
      await invitation.save({ session: mongoSession });
    });
  } catch {
    redirect("/login?error=invitation_invalid_or_used");
  } finally {
    await mongoSession.endSession();
  }
  revalidatePath("/team");
  redirect(`/team?institutionId=${institutionId}&joined=1`);
}
