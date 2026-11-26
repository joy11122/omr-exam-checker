import { z } from "zod";

const subjectSchema = z.object({
  name: z.string().trim().min(2).max(80),
  questionCount: z.number().int().min(1).max(300),
  marksPerQuestion: z.number().positive().max(100),
  negativeMarksPerQuestion: z.number().min(0).max(100),
}).refine((subject) => subject.negativeMarksPerQuestion <= subject.marksPerQuestion, {
  message: "Negative marks cannot exceed marks per question.",
  path: ["negativeMarksPerQuestion"],
});

export const createExamSchema = z.object({
  institutionId: z.string().regex(/^[a-f\d]{24}$/i),
  title: z.string().trim().min(3).max(120),
  examCode: z.string().trim().min(2).max(30).regex(/^[a-zA-Z0-9_-]+$/),
  description: z.string().trim().max(500).optional().default(""),
  startsAt: z.string().optional().default(""),
  durationMinutes: z.number().int().min(5).max(600),
  subjects: z.array(subjectSchema).min(1).max(20),
}).refine((data) => data.subjects.reduce((sum, subject) => sum + subject.questionCount, 0) <= 1000, {
  message: "An exam cannot contain more than 1,000 questions.",
  path: ["subjects"],
});

export const answerKeySchema = z.object({
  institutionId: z.string().regex(/^[a-f\d]{24}$/i),
  examId: z.string().regex(/^[a-f\d]{24}$/i),
  subjectId: z.string().regex(/^[a-f\d]{24}$/i),
  answerKeyText: z.string().trim().min(1).max(12000),
});
