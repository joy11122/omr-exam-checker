import { z } from "zod";
export const credentialsSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(72),
});
export const registrationSchema = credentialsSchema.extend({ name: z.string().trim().min(2).max(100) });

export const nativeGoogleSchema = z.object({ idToken: z.string().min(100).max(8192) });
