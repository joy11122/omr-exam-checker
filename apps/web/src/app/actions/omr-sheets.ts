"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { requireInstitutionRole } from "@/lib/tenancy/authorization";
import { omrTemplateSchema } from "@/lib/validations/omr-sheets";
import { Exam } from "@/models";

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

export async function updateOmrTemplate(formData: FormData) {
  const parsed = omrTemplateSchema.safeParse({
    institutionId: value(formData, "institutionId"),
    examId: value(formData, "examId"),
    rollDigits: Number(value(formData, "rollDigits")),
    questionsPerPage: Number(value(formData, "questionsPerPage")),
    includeStudentName: formData.get("includeStudentName") === "on",
    includeClass: formData.get("includeClass") === "on",
    instructions: value(formData, "instructions"),
  });
  if (!parsed.success) redirect("/exams?error=invalid_template");
  const session = await auth();
  if (!session?.user?.id || !mongoose.isValidObjectId(session.user.id)) redirect("/login");
  try {
    await requireInstitutionRole(parsed.data.institutionId, "teacher");
    await connectToDatabase();
    const result = await Exam.updateOne(
      { _id: new mongoose.Types.ObjectId(parsed.data.examId), institutionId: new mongoose.Types.ObjectId(parsed.data.institutionId) },
      { $set: { sheetSettings: {
        rollDigits: parsed.data.rollDigits,
        questionsPerPage: parsed.data.questionsPerPage,
        includeStudentName: parsed.data.includeStudentName,
        includeClass: parsed.data.includeClass,
        instructions: parsed.data.instructions,
      } } },
    ).exec();
    if (result.matchedCount !== 1) redirect("/exams?error=exam_not_found");
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/exams?error=forbidden");
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    redirect("/exams?error=template_save_failed");
  }
  revalidatePath("/exams/" + parsed.data.examId + "/sheets");
  redirect("/exams/" + parsed.data.examId + "/sheets?institutionId=" + parsed.data.institutionId + "&saved=1");
}
