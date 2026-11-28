export const PLAN_CATALOG = {
  free: { name: "Free", priceLabel: "Free", limits: { students: 100, exams: 10, members: 5, scansPerMonth: 300 }, features: ["OMR exam creation", "Answer key and automated grading", "Published result portal", "Basic analytics"] },
  growth: { name: "Growth", priceLabel: "Contact sales", limits: { students: 2000, exams: 100, members: 25, scansPerMonth: 5000 }, features: ["Everything in Free", "Larger student and team capacity", "Higher monthly scan allowance", "Priority support"] },
  enterprise: { name: "Enterprise", priceLabel: "Custom", limits: { students: null, exams: null, members: null, scansPerMonth: null }, features: ["Everything in Growth", "Custom usage limits", "Dedicated onboarding", "Custom support and billing"] },
} as const;

export type PlanId = keyof typeof PLAN_CATALOG;
export type UsageMetric = keyof (typeof PLAN_CATALOG)["free"]["limits"];

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && Object.hasOwn(PLAN_CATALOG, value);
}

export function withinPlanLimit(plan: PlanId, metric: UsageMetric, current: number, increment = 1) {
  const limit = PLAN_CATALOG[plan].limits[metric] as number | null;
  return { allowed: limit === null || current + increment <= limit, limit, current, requested: current + increment };
}
