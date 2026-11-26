"use server";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { connectToDatabase } from "@/lib/mongodb/client";
import { User } from "@/models";
import { registrationSchema } from "@/lib/validations/auth";

export async function registerUser(formData: FormData) {
  const parsed = registrationSchema.safeParse({ name: formData.get("name"), email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) redirect("/register?error=invalid_input");
  try {
    await connectToDatabase();
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    await User.create({ name: parsed.data.name, email: parsed.data.email, passwordHash });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) redirect("/register?error=email_exists");
    redirect("/register?error=registration_failed");
  }
  redirect("/login?registered=1");
}
