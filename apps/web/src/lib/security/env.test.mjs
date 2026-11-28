import test from "node:test";
import assert from "node:assert/strict";
import { validateServerEnvironment } from "./env.ts";

test("requires a strong auth secret and HTTPS app URL in production", () => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    mongo: process.env.MONGODB_URI,
    db: process.env.MONGODB_DB_NAME,
    secret: process.env.AUTH_SECRET,
    app: process.env.APP_URL,\n    googleId: process.env.AUTH_GOOGLE_ID,\n    googleSecret: process.env.AUTH_GOOGLE_SECRET,\n    nativeGoogleId: process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  };
  try {
    process.env.NODE_ENV = "production";
    process.env.MONGODB_URI = "mongodb+srv://user:pass@example.mongodb.net";
    process.env.MONGODB_DB_NAME = "omr_exam_checker";
    process.env.AUTH_SECRET = "a".repeat(40);
    process.env.APP_URL = "https://exam.example.com";\n    delete process.env.AUTH_GOOGLE_ID;\n    delete process.env.AUTH_GOOGLE_SECRET;\n    delete process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    assert.equal(validateServerEnvironment().APP_URL, "https://exam.example.com");
    process.env.AUTH_SECRET = "short";
    assert.throws(() => validateServerEnvironment(), /AUTH_SECRET/);
    process.env.AUTH_SECRET = "a".repeat(40);
    process.env.APP_URL = "http://exam.example.com";
    assert.throws(() => validateServerEnvironment(), /APP_URL/);
  } finally {
    for (const [key, value] of [["NODE_ENV", previous.nodeEnv], ["MONGODB_URI", previous.mongo], ["MONGODB_DB_NAME", previous.db], ["AUTH_SECRET", previous.secret], ["APP_URL", previous.app], ["AUTH_GOOGLE_ID", previous.googleId], ["AUTH_GOOGLE_SECRET", previous.googleSecret], ["NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID", previous.nativeGoogleId]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
