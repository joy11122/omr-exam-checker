"use server";
import { redirect } from "next/navigation";
import mongoose from "mongoose";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { Institution, Membership, User } from "@/models";
import { createInstitutionSchema } from "@/lib/validations/institution";

export async function createInstitution(formData: FormData) {
  const parsed = createInstitutionSchema.safeParse({ name: formData.get("name"), slug: formData.get("slug") });
  if (!parsed.success) redirect("/dashboard?error=invalid_institution");
  const session = await auth();
  if (!session?.user?.id || !mongoose.isValidObjectId(session.user.id)) redirect("/login");
  try {
    await connectToDatabase();
    const user = await User.findById(session.user.id).select("_id");
    if (!user) redirect("/login");
    const mongoSession = await mongoose.startSession();
    try {
      await mongoSession.withTransaction(async () => {
        const [institution] = await Institution.create([{ name: parsed.data.name, slug: parsed.data.slug, createdBy: user._id }], { session: mongoSession });
        await Membership.create([{ institutionId: institution._id, userId: user._id, role: "owner" }], { session: mongoSession });
      });
    } finally { await mongoSession.endSession(); }
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) redirect("/dashboard?error=slug_taken");
    redirect("/dashboard?error=institution_create_failed");
  }
  redirect("/dashboard?created=1");
}
