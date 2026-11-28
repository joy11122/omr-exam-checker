import test from "node:test";
import assert from "node:assert/strict";
import { getClientAddress, isRateLimitAllowed } from "./rate-limit-utils.ts";

test("prefers a valid proxy-provided client address", () => {
  const headers = new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.2" });
  assert.equal(getClientAddress(headers), "203.0.113.7");
});

test("uses the first valid forwarded address when real IP is absent", () => {
  const headers = new Headers({ "x-forwarded-for": "198.51.100.9, 10.0.0.1" });
  assert.equal(getClientAddress(headers), "198.51.100.9");
});

test("does not trust malformed proxy address values", () => {
  const headers = new Headers({ "x-real-ip": "not-an-ip", "x-forwarded-for": "bad, 10.0.0.1" });
  assert.equal(getClientAddress(headers), "unknown");
});

test("allows only positive integer request counts within the configured limit", () => {
  assert.equal(isRateLimitAllowed(1, 5), true);
  assert.equal(isRateLimitAllowed(5, 5), true);
  assert.equal(isRateLimitAllowed(6, 5), false);
  assert.equal(isRateLimitAllowed(0, 5), false);
  assert.equal(isRateLimitAllowed(1.5, 5), false);
  assert.equal(isRateLimitAllowed(1, 0), false);
});
