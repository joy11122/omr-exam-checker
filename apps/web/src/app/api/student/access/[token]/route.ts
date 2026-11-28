import { NextResponse } from "next/server";
import { exchangeStudentMagicLink, STUDENT_SESSION_COOKIE, studentSessionMaxAge } from "@/lib/student-portal/access";

type Context = { params: Promise<{ token: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (!origin || !host || new URL(origin).host !== host) {
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    }
    const { token } = await context.params;
    const session = await exchangeStudentMagicLink(token);
    if (!session) return NextResponse.json({ error: "This access link is invalid, expired, or already used." }, { status: 401 });

    const response = NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(STUDENT_SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: studentSessionMaxAge,
      expires: session.expiresAt,
    });
    return response;
  } catch (error) {
    console.error("Student portal access exchange failed", error);
    return NextResponse.json({ error: "Unable to open the student portal right now." }, { status: 500 });
  }
}
