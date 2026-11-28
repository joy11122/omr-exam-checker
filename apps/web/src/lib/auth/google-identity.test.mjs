import test from "node:test";
import assert from "node:assert/strict";
import { normalizeVerifiedGoogleIdentity } from "./google-identity-utils.ts";

test("accepts only a verified Google email and normalizes it", () => {
  assert.deepEqual(
    normalizeVerifiedGoogleIdentity({ sub: "google-subject", email: "JOY@Example.com", email_verified: true, name: "Joy", picture: "https://images.example.com/avatar.png" }),
    { googleSubject: "google-subject", email: "joy@example.com", name: "Joy", image: "https://images.example.com/avatar.png" },
  );
});

test("rejects missing subject, email, or unverified email", () => {
  assert.equal(normalizeVerifiedGoogleIdentity(undefined), null);
  assert.equal(normalizeVerifiedGoogleIdentity({ email: "joy@example.com", email_verified: true }), null);
  assert.equal(normalizeVerifiedGoogleIdentity({ sub: "subject", email: "joy@example.com", email_verified: false }), null);
});

test("rejects oversized email and non-HTTPS profile images", () => {
  assert.equal(normalizeVerifiedGoogleIdentity({ sub: "subject", email: "a".repeat(250) + "@x.com", email_verified: true }), null);
  assert.equal(normalizeVerifiedGoogleIdentity({ sub: "subject", email: "joy@example.com", email_verified: true, picture: "http://unsafe.example/avatar.png" })?.image, null);
});
