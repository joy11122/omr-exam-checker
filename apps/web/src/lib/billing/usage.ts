import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/mongodb/client";
import { PLAN_CATALOG, type PlanId, type UsageMetric, withinPlanLimit } from "@/lib/billing/plans";
import { Exam, Membership, Student } from "@/models";
import { Subscription } from "@/models/subscription";

export async function getInstitutionUsage(institutionId: string) {
  if (!mongoose.isValidObjectId(institutionId)) throw new Error("INVALID_INSTITUTION");
  await connectToDatabase();
  const tenant = new mongoose.Types.ObjectId(institutionId);
  const [students, exams, members, subscription] = await Promise.all([
    Student.countDocuments({ institutionId: tenant }),
    Exam.countDocuments({ institutionId: tenant }),
    Membership.countDocuments({ institutionId: tenant }),
    Subscription.findOne({ institutionId: tenant }).lean().exec(),
  ]);
  const plan = (subscription?.plan ?? "free") as PlanId;
  const limits = PLAN_CATALOG[plan].limits;
  return {
    plan,
    status: subscription?.status ?? "active",
    usage: { students, exams, members, scansPerMonth: 0 },
    limits,
    remaining: {
      students: limits.students === null ? null : Math.max(0, limits.students - students),
      exams: limits.exams === null ? null : Math.max(0, limits.exams - exams),
      members: limits.members === null ? null : Math.max(0, limits.members - members),
      scansPerMonth: limits.scansPerMonth,
    },
  };
}

export async function assertUsageAllowed(institutionId: string, metric: UsageMetric, increment = 1) {
  const summary = await getInstitutionUsage(institutionId);
  const check = withinPlanLimit(summary.plan, metric, summary.usage[metric], increment);
  if (!check.allowed) {
    const error = new Error("PLAN_LIMIT_REACHED");
    Object.assign(error, { metric, limit: check.limit, current: check.current, plan: summary.plan });
    throw error;
  }
  return summary;
}
