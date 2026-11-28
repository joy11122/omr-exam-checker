import "server-only";

function escapeHtml(value: string) {
  const entities: Record<string, string> = {
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  };
  return value.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}

export async function sendStudentResultEmail(input: {
  to: string;
  studentName: string;
  examTitle: string;
  examCode: string;
  accessUrl: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESULTS_FROM_EMAIL;
  if (!apiKey || !from) return { sent: false as const, reason: "not_configured" as const };

  const studentName = escapeHtml(input.studentName);
  const examTitle = escapeHtml(input.examTitle);
  const examCode = escapeHtml(input.examCode);
  const accessUrl = escapeHtml(input.accessUrl);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: "Your exam result is published: " + input.examTitle,
      text: `Hello ${input.studentName}, your result for ${input.examTitle} (${input.examCode}) is published. Open this secure link within 30 minutes: ${input.accessUrl}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#202123"><h2>Your exam result is ready</h2><p>Hello ${studentName},</p><p>Your result for <strong>${examTitle}</strong> (${examCode}) has been published by your institution.</p><p><a href="${accessUrl}" style="display:inline-block;padding:13px 18px;background:#202123;color:#fff;text-decoration:none;border-radius:8px">View my result</a></p><p style="color:#737780;font-size:12px">This one-time access link expires in 30 minutes. Do not forward it to anyone.</p></div>`,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error("Resend delivery failed with status " + response.status + (detail ? ": " + detail.slice(0, 300) : ""));
  }
  return { sent: true as const };
}
