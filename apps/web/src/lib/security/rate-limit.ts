import "server-only";

import { createHmac } from "node:crypto";
import mongoose from "mongoose";
import type { Document } from "mongodb";
import { NextResponse } from "next/server";
import { getClientAddress, isRateLimitAllowed } from "@/lib/security/rate-limit-utils";
import { connectToDatabase } from "@/lib/mongodb/client";

type RateLimitDocument = Document & { _id: string; count: number; resetAt: Date };
type RateLimitOptions = { scope: string; limit: number; windowMs: number };
type RateLimitOutcome =
  | { allowed: true; limit: number; remaining: number; resetAt: Date }
  | { allowed: false; limit: number; remaining: 0; resetAt: Date; retryAfterSeconds: number }
  | { allowed: false; unavailable: true };

let ttlIndexPromise: Promise<string> | null = null;

export async function checkRequestRateLimit(
  request: Request,
  options: RateLimitOptions,
): Promise<RateLimitOutcome> {
  if (!/^[a-z0-9:_-]{2,80}$/i.test(options.scope) || !Number.isSafeInteger(options.limit) || options.limit < 1 || !Number.isSafeInteger(options.windowMs) || options.windowMs < 1000) {
    throw new Error("Invalid rate limit configuration.");
  }

  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret || secret.length < 32) throw new Error("Rate limit signing secret is unavailable.");
    await connectToDatabase();
    const database = mongoose.connection.db;
    if (!database) throw new Error("MongoDB is not connected.");

    const collection = database.collection<RateLimitDocument>("rate_limits");
    ttlIndexPromise ??= collection.createIndex({ resetAt: 1 }, { expireAfterSeconds: 0, name: "rate_limits_expire_at" });
    await ttlIndexPromise;

    const now = new Date();
    const resetAt = new Date(now.getTime() + options.windowMs);
    const address = getClientAddress(request.headers);
    const id = createHmac("sha256", secret).update(options.scope).update("\0").update(address).digest("hex");

    // A single atomic update prevents concurrent requests from bypassing the limit.
    await collection.updateOne(
      { _id: id },
      [{
        $set: {
          count: { $cond: [{ $gt: ["$resetAt", now] }, { $add: [{ $ifNull: ["$count", 0] }, 1] }, 1] },
          resetAt: { $cond: [{ $gt: ["$resetAt", now] }, "$resetAt", resetAt] },
        },
      }],
      { upsert: true },
    );
    const record = await collection.findOne({ _id: id });
    if (!record) throw new Error("Rate limit counter could not be read.");

    const allowed = isRateLimitAllowed(record.count, options.limit);
    if (!allowed) {
      return {
        allowed: false,
        limit: options.limit,
        remaining: 0,
        resetAt: record.resetAt,
        retryAfterSeconds: Math.max(1, Math.ceil((record.resetAt.getTime() - Date.now()) / 1000)),
      };
    }
    return { allowed: true, limit: options.limit, remaining: Math.max(0, options.limit - record.count), resetAt: record.resetAt };
  } catch (error) {
    console.error("Rate limit service unavailable", error);
    return { allowed: false, unavailable: true };
  }
}

export function rateLimitResponse(outcome: RateLimitOutcome): NextResponse | null {
  if (outcome.allowed) return null;
  if ("unavailable" in outcome) {
    return NextResponse.json({ error: "Security protection is temporarily unavailable. Please retry shortly." }, {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "30" },
    });
  }
  return NextResponse.json({ error: "Too many requests. Please wait before trying again." }, {
    status: 429,
    headers: {
      "Cache-Control": "no-store",
      "Retry-After": String(outcome.retryAfterSeconds),
      "X-RateLimit-Limit": String(outcome.limit),
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": String(Math.ceil(outcome.resetAt.getTime() / 1000)),
    },
  });
}
