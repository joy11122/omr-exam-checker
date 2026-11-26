"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import mongoose from "mongoose";
import { auth } from "@/auth";
import { requireInstitutionRole } from "@/lib/tenancy/authorization";
import { connectToDatabase } from "@/lib/mongodb/client";
import { Student } from "@/models";
import { bulkStudentsSchema, studentSchema, updateStudentSchema } from "@/lib/validations/phase-two";

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "", quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { values.push(value.trim()); value = ""; }
    else value += char;
  }
  values.push(value.trim());
  return values;
}

export async function createStudent(formData: FormData) {
  const parsed = studentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/students?error=invalid_student");
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  try {
    await requireInstitutionRole(parsed.data.institutionId, "teacher");
    await connectToDatabase();
    await Student.create({ ...parsed.data, institutionId: new mongoose.Types.ObjectId(parsed.data.institutionId) });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/students?error=forbidden");
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) redirect("/students?error=student_code_exists");
    redirect("/students?error=student_create_failed");
  }
  revalidatePath("/students");
  redirect(`/students?institutionId=${parsed.data.institutionId}&created=1`);
}

export async function updateStudent(formData: FormData) {
  const parsed = updateStudentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/students?error=invalid_student");
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  try {
    await requireInstitutionRole(parsed.data.institutionId, "teacher");
    await connectToDatabase();
    const { studentId, institutionId, ...values } = parsed.data;
    const result = await Student.updateOne(
      { _id: new mongoose.Types.ObjectId(studentId), institutionId: new mongoose.Types.ObjectId(institutionId) },
      { $set: values },
    );
    if (!result.matchedCount) redirect("/students?error=student_not_found");
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/students?error=forbidden");
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) redirect("/students?error=student_code_exists");
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    redirect("/students?error=student_update_failed");
  }
  revalidatePath("/students");
  redirect(`/students?institutionId=${parsed.data.institutionId}&updated=1`);
}

export async function deleteStudent(formData: FormData) {
  const institutionId = String(formData.get("institutionId") ?? "");
  const studentId = String(formData.get("studentId") ?? "");
  if (!mongoose.isValidObjectId(institutionId) || !mongoose.isValidObjectId(studentId)) redirect("/students?error=invalid_student");
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  try {
    await requireInstitutionRole(institutionId, "admin");
    await connectToDatabase();
    await Student.deleteOne({ _id: new mongoose.Types.ObjectId(studentId), institutionId: new mongoose.Types.ObjectId(institutionId) });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/students?error=forbidden");
    redirect("/students?error=student_delete_failed");
  }
  revalidatePath("/students");
  redirect(`/students?institutionId=${institutionId}&deleted=1`);
}

export async function importStudents(formData: FormData) {
  const parsed = bulkStudentsSchema.safeParse({ institutionId: formData.get("institutionId"), csv: formData.get("csv") });
  if (!parsed.success) redirect("/students?error=invalid_csv");
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  try {
    await requireInstitutionRole(parsed.data.institutionId, "teacher");
    const lines = parsed.data.csv.split(/\r?\n/).filter((line) => line.trim());
    const headers = parseCsvLine(lines.shift() ?? "").map((value) => value.toLowerCase());
    const required = ["studentcode", "fullname"];
    if (required.some((header) => !headers.includes(header)) || lines.length > 500) redirect("/students?error=invalid_csv");
    const rows = lines.map((line) => {
      const values = parseCsvLine(line);
      return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    });
    const records = rows.map((row) => studentSchema.safeParse({
      institutionId: parsed.data.institutionId,
      studentCode: row.studentcode,
      fullName: row.fullname,
      className: row.classname,
      section: row.section,
      rollNumber: row.rollnumber,
      email: row.email,
      phone: row.phone,
    }));
    if (!records.length || records.some((record) => !record.success)) redirect("/students?error=invalid_csv");
    const validRecords = records.map((record) => {
      if (!record.success) throw new Error("Invalid student row");
      return { ...record.data, institutionId: new mongoose.Types.ObjectId(parsed.data.institutionId) };
    });
    const codes = validRecords.map((record) => record.studentCode.toUpperCase());
    if (new Set(codes).size !== codes.length) redirect("/students?error=duplicate_codes_in_csv");
    await connectToDatabase();
    const existing = await Student.exists({ institutionId: new mongoose.Types.ObjectId(parsed.data.institutionId), studentCode: { $in: codes } });
    if (existing) redirect("/students?error=some_codes_exist");
    const mongoSession = await mongoose.startSession();
    try {
      await mongoSession.withTransaction(async () => {
        await Student.insertMany(validRecords, { ordered: true, session: mongoSession });
      });
    } finally {
      await mongoSession.endSession();
    }
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/students?error=forbidden");
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) redirect("/students?error=some_codes_exist");
    redirect("/students?error=import_failed");
  }
  revalidatePath("/students");
  redirect(`/students?institutionId=${parsed.data.institutionId}&imported=1`);
}
