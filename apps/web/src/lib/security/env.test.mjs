import test from "node:test";
import assert from "node:assert/strict";
import { validateServerEnvironment } from "./env.ts";

test("requires a strong auth secret and HTTPS app URL in production", () => {
  const keys = [
    "NODE_ENV",
    "MONGODB_URI",
    "MONGODB_DB_NAME",
    "AUTH_SECRET",
    "APP_URL",
    "AUTH_GOOGLE_ID",
    "AUTH_GOOGLE_SECRET",
    "NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.NODE_ENV = "production";
    process.env.MONGODB_URI = "mongodb+srv://user:pass@example.mongodb.net";
    process.env.MONGODB_DB_NAME = "omr_exam_checker";
    process.env.AUTH_SECRET = "a".repeat(40);
    process.env.APP_URL = "https://exam.example.com";
    delete process.env.AUTH_GOOGLE_ID;
    delete process.env.AUTH_GOOGLE_SECRET;
    delete process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID;

    assert.equal(validateServerEnvironment().APP_URL, "https://exam.example.com");
    process.env.AUTH_SECRET = "short";
    assert.throws(() => validateServerEnvironment(), /AUTH_SECRET/);
    process.env.AUTH_SECRET = "a".repeat(40);
    process.env.APP_URL = "http://exam.example.com";
    assert.throws(() => validateServerEnvironment(), /APP_URL/);
    process.env.APP_URL = "https://exam.example.com";

    process.env.AUTH_GOOGLE_SECRET = "google-secret";
    assert.throws(() => validateServerEnvironment(), /AUTH_GOOGLE_ID/);
    process.env.AUTH_GOOGLE_ID = "web-client-id";
    process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID = "different-client-id";
    assert.throws(() => validateServerEnvironment(), /NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID/);
    process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID = "web-client-id";
    assert.equal(validateServerEnvironment().NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID, "web-client-id");
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
