import { z } from "zod";

export const omrTemplateSchema = z.object({
  institutionId: z.string().regex(/^[a-f\d]{24}$/i),
  examId: z.string().regex(/^[a-f\d]{24}$/i),
  rollDigits: z.number().int().min(4).max(12),
  questionsPerPage: z.number().int().min(20).max(80),
  includeStudentName: z.boolean(),
  includeClass: z.boolean(),
  instructions: z.string().trim().max(300),
});
