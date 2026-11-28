import { z } from "zod";

const envSchema = z.object({
  MONGODB_URI: z.string().min(1).refine((value) => value.startsWith("mongodb://") || value.startsWith("mongodb+srv://"), "MONGODB_URI must use mongodb:// or mongodb+srv://"),
  MONGODB_DB_NAME: z.string().min(1).max(63).regex(/^[^./\\\\ "$]+$/, "MONGODB_DB_NAME contains unsupported characters").default("omr_exam_checker"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must contain at least 32 characters"),
  APP_URL: z.string().url().refine((value) => process.env.NODE_ENV !== "production" || value.startsWith("https://"), "APP_URL must use HTTPS in production"),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID: z.string().optional(),
  OMR_ENGINE_URL: z.string().url().optional(),
  OMR_ENGINE_API_KEY: z.string().min(24).optional(),
}).superRefine((value, context) => {
  if (value.AUTH_GOOGLE_SECRET && !value.AUTH_GOOGLE_ID) {
    context.addIssue({ code: "custom", path: ["AUTH_GOOGLE_ID"], message: "AUTH_GOOGLE_ID is required when AUTH_GOOGLE_SECRET is configured" });
  }
  if (value.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID && !value.AUTH_GOOGLE_ID) {
    context.addIssue({ code: "custom", path: ["AUTH_GOOGLE_ID"], message: "AUTH_GOOGLE_ID is required for native Google sign-in" });
  }
  if (value.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID && value.AUTH_GOOGLE_ID && value.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID !== value.AUTH_GOOGLE_ID) {
    context.addIssue({ code: "custom", path: ["NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID"], message: "Native Google client ID must match AUTH_GOOGLE_ID" });
  }
});

export function validateServerEnvironment() {
  const parsed = envSchema.safeParse({
    MONGODB_URI: process.env.MONGODB_URI,
    MONGODB_DB_NAME: process.env.MONGODB_DB_NAME,
    AUTH_SECRET: process.env.AUTH_SECRET,
    APP_URL: process.env.APP_URL,
    AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
    NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    OMR_ENGINE_URL: process.env.OMR_ENGINE_URL,
    OMR_ENGINE_API_KEY: process.env.OMR_ENGINE_API_KEY,
  });
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => issue.path.join(".") + ": " + issue.message).join("; ");
    throw new Error("Server environment validation failed: " + details);
  }
  return parsed.data;
}
