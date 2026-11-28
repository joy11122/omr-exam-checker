"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { requireInstitutionRole } from "@/lib/tenancy/authorization";
import { answerKeySchema, createExamSchema } from "@/lib/validations/exams";
import { Exam } from "@/models";
import { assertUsageAllowed } from "@/lib/billing/usage";

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function parseSubjects(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [name, questions, marks, negative = "0"] = line.split(",").map((part) => part.trim());
    return {
      name,
      questionCount: Number(questions),
      marksPerQuestion: Number(marks),
      negativeMarksPerQuestion: Number(negative),
    };
  });
}

export async function createExam(formData: FormData) {
  const parsed = createExamSchema.safeParse({
    institutionId: formString(formData, "institutionId"),
    title: formString(formData, "title"),
    examCode: formString(formData, "examCode"),
    description: formString(formData, "description"),
    startsAt: formString(formData, "startsAt"),
    durationMinutes: Number(formString(formData, "durationMinutes")),
    subjects: parseSubjects(formString(formData, "subjects")),
  });
  if (!parsed.success) redirect("/exams?error=invalid_exam");
  const session = await auth();
  if (!session?.user?.id || !mongoose.isValidObjectId(session.user.id)) redirect("/login");
  try {
    await requireInstitutionRole(parsed.data.institutionId, "teacher");
    await connectToDatabase();
    await assertUsageAllowed(parsed.data.institutionId, "exams");
    const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : null;
    if (startsAt && Number.isNaN(startsAt.getTime())) redirect("/exams?error=invalid_exam");
    await Exam.create({
      institutionId: new mongoose.Types.ObjectId(parsed.data.institutionId),
      createdBy: new mongoose.Types.ObjectId(session.user.id),
      title: parsed.data.title,
      examCode: parsed.data.examCode.toUpperCase(),
      description: parsed.data.description,
      startsAt,
      durationMinutes: parsed.data.durationMinutes,
      status: startsAt ? "scheduled" : "draft",
      subjects: parsed.data.subjects.map((subject) => ({ ...subject, answerKey: [] })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/exams?error=forbidden");
    if (error instanceof Error && error.message === "PLAN_LIMIT_REACHED") redirect("/exams?error=plan_limit_reached");
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) redirect("/exams?error=exam_code_exists");
    redirect("/exams?error=create_failed");
  }
  revalidatePath("/exams");
  redirect("/exams?institutionId=" + parsed.data.institutionId + "&created=1");
}

export async function saveAnswerKey(formData: FormData) {
  const parsed = answerKeySchema.safeParse({
    institutionId: formString(formData, "institutionId"),
    examId: formString(formData, "examId"),
    subjectId: formString(formData, "subjectId"),
    answerKeyText: formString(formData, "answerKeyText"),
  });
  if (!parsed.success) redirect("/exams?error=invalid_answer_key");
  const session = await auth();
  if (!session?.user?.id || !mongoose.isValidObjectId(session.user.id)) redirect("/login");
  try {
    await requireInstitutionRole(parsed.data.institutionId, "teacher");
    await connectToDatabase();
    const exam = await Exam.findOne({
      _id: new mongoose.Types.ObjectId(parsed.data.examId),
      institutionId: new mongoose.Types.ObjectId(parsed.data.institutionId),
    }).exec();
    if (!exam) redirect("/exams?error=exam_not_found");
    const subject = exam.subjects.id(parsed.data.subjectId);
    if (!subject) redirect("/exams/" + parsed.data.examId + "?institutionId=" + parsed.data.institutionId + "&error=subject_not_found");
    const lines = parsed.data.answerKeyText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const answers: { questionNumber: number; option: string }[] = [];
    const seen = new Set<number>();
    for (const line of lines) {
      const match = /^(\d+)\s*[,;:]\s*([A-D])$/i.exec(line);
      if (!match) redirect("/exams/" + parsed.data.examId + "?institutionId=" + parsed.data.institutionId + "&error=invalid_answer_key");
      const questionNumber = Number(match[1]);
      const option = match[2].toUpperCase();
      if (questionNumber < 1 || questionNumber > subject.questionCount || seen.has(questionNumber)) {
        redirect("/exams/" + parsed.data.examId + "?institutionId=" + parsed.data.institutionId + "&error=invalid_answer_key");
      }
      seen.add(questionNumber);
      answers.push({ questionNumber, option });
    }
    subject.answerKey = answers;
    subject.answerKeyUpdatedAt = new Date();
    await exam.save();
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/exams?error=forbidden");
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    redirect("/exams?error=save_failed");
  }
  revalidatePath("/exams");
  revalidatePath("/exams/" + parsed.data.examId);
  redirect("/exams/" + parsed.data.examId + "?institutionId=" + parsed.data.institutionId + "&saved=1");
}
