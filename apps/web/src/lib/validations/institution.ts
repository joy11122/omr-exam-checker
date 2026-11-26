import { z } from "zod";

export const createInstitutionSchema = z.object({
  name: z.string().trim().min(2, "Institution name must be at least 2 characters.").max(100),
  slug: z.string().trim().min(2).max(48).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only."),
});

export type CreateInstitutionInput = z.infer<typeof createInstitutionSchema>;
