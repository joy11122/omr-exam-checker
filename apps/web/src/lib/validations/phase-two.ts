import { z } from "zod";
import { institutionRoles } from "@/models";

export const institutionProfileSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().min(2).max(48).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  email: z.union([z.string().trim().email().max(254), z.literal("")]).optional(),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(300).optional(),
  website: z.union([z.string().trim().url().max(200), z.literal("")]).optional(),
});

export const studentSchema = z.object({
  institutionId: z.string().regex(/^[a-f\d]{24}$/i),
  studentCode: z.string().trim().min(1).max(40),
  fullName: z.string().trim().min(2).max(120),
  className: z.string().trim().max(60).optional().default(""),
  section: z.string().trim().max(40).optional().default(""),
  rollNumber: z.string().trim().max(40).optional().default(""),
  email: z.union([z.string().trim().email().max(254), z.literal("")]).optional().default(""),
  phone: z.string().trim().max(30).optional().default(""),
});

export const updateStudentSchema = studentSchema.extend({
  studentId: z.string().regex(/^[a-f\d]{24}$/i),
});

export const bulkStudentsSchema = z.object({
  institutionId: z.string().regex(/^[a-f\d]{24}$/i),
  csv: z.string().trim().min(1).max(250_000),
});

export const invitationSchema = z.object({
  institutionId: z.string().regex(/^[a-f\d]{24}$/i),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  role: z.enum(["admin", "teacher", "examiner"]),
});

export const membershipRoleSchema = z.object({
  institutionId: z.string().regex(/^[a-f\d]{24}$/i),
  membershipId: z.string().regex(/^[a-f\d]{24}$/i),
  role: z.enum(institutionRoles),
});

export const removeMemberSchema = z.object({
  institutionId: z.string().regex(/^[a-f\d]{24}$/i),
  membershipId: z.string().regex(/^[a-f\d]{24}$/i),
});

export type StudentInput = z.infer<typeof studentSchema>;
