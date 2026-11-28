import { NextResponse } from "next/server";
import { STUDENT_SESSION_COOKIE } from "@/lib/student-portal/access";
import { StudentPortalToken } from "@/models/student-portal-token";
import { connectToDatabase } from "@/lib/mongodb/client";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (!origin || !host || new URL(origin).host !== host) {
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    }
    const cookieStore = await cookies();
    const token = cookieStore.get(STUDENT_SESSION_COOKIE)?.value;
    if (token && /^[a-f0-9]{64}$/i.test(token)) {
      await connectToDatabase();
      await StudentPortalToken.deleteOne({
        tokenHash: createHash("sha256").update(token).digest("hex"),
        purpose: "session",
      });
    }
    const response = NextResponse.json({ success: true });
    response.cookies.set(STUDENT_SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    console.error("Student portal sign-out failed", error);
    return NextResponse.json({ error: "Unable to sign out right now." }, { status: 500 });
  }
}
