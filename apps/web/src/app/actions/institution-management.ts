"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { requireInstitutionRole } from "@/lib/tenancy/authorization";
import { connectToDatabase } from "@/lib/mongodb/client";
import { Institution } from "@/models";
import { institutionProfileSchema } from "@/lib/validations/phase-two";

export async function updateInstitutionProfile(formData: FormData) {
  const institutionId = String(formData.get("institutionId") ?? "");
  const parsed = institutionProfileSchema.safeParse({
    name: formData.get("name"), slug: formData.get("slug"), email: formData.get("email"),
    phone: formData.get("phone"), address: formData.get("address"), website: formData.get("website"),
  });
  if (!parsed.success || !/^[a-f\d]{24}$/i.test(institutionId)) redirect("/settings?error=invalid_profile");
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  try {
    await requireInstitutionRole(institutionId, "admin");
    await connectToDatabase();
    await Institution.updateOne({ _id: institutionId }, { $set: parsed.data });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/settings?error=forbidden");
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) redirect("/settings?error=slug_taken");
    redirect("/settings?error=save_failed");
  }
  revalidatePath("/settings");
  redirect(`/settings?institutionId=${institutionId}&saved=1`);
}
