import test from "node:test";
import assert from "node:assert/strict";
import { parseReportFilters } from "./report-filters.ts";
test("accepts valid date ranges and class filters", () => {
 const result=parseReportFilters({from:"2026-01-01",to:"2026-03-31",className:"Class 8"});
 assert.equal(result.success,true);
 if(result.success){assert.equal(result.data.from?.toISOString(),"2026-01-01T00:00:00.000Z");assert.equal(result.data.to?.toISOString(),"2026-03-31T23:59:59.999Z");}
});
test("rejects invalid, reversed and overlong date ranges", () => {
 assert.equal(parseReportFilters({from:"2026-02-30"}).success,false);
 assert.equal(parseReportFilters({from:"2026-05-01",to:"2026-04-01"}).success,false);
 assert.equal(parseReportFilters({from:"2024-01-01",to:"2026-01-01"}).success,false);
});
test("rejects malformed exam ids and oversized class names", () => {
 assert.equal(parseReportFilters({examId:"invalid"}).success,false);
 assert.equal(parseReportFilters({className:"x".repeat(61)}).success,false);
});
