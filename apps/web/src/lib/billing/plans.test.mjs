import test from "node:test";
import assert from "node:assert/strict";
import { PLAN_CATALOG, withinPlanLimit, isPlanId } from "./plans.ts";

test("free plan blocks creation at the configured student and exam limits", () => {
  assert.equal(withinPlanLimit("free", "students", 99).allowed, true);
  assert.equal(withinPlanLimit("free", "students", 100).allowed, false);
  assert.equal(withinPlanLimit("free", "exams", 10).allowed, false);
});

test("bulk imports are checked as a single requested increment", () => {
  const result = withinPlanLimit("free", "students", 95, 6);
  assert.equal(result.allowed, false);
  assert.equal(result.requested, 101);
});

test("enterprise plan supports custom unlimited quotas", () => {
  assert.equal(withinPlanLimit("enterprise", "students", 100000).allowed, true);
  assert.equal(PLAN_CATALOG.enterprise.limits.scansPerMonth, null);
});

test("plan identifiers are validated against the catalog", () => {
  assert.equal(isPlanId("growth"), true);
  assert.equal(isPlanId("premium"), false);
  assert.equal(isPlanId(null), false);
});
