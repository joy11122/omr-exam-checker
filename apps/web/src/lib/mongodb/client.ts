import "server-only";
import mongoose from "mongoose";
import { z } from "zod";

const envSchema = z.object({ MONGODB_URI: z.string().min(1), MONGODB_DB_NAME: z.string().min(1).default("omr_exam_checker") });
type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
declare global { var mongooseCache: Cache | undefined; }
const cache = globalThis.mongooseCache ?? { conn: null, promise: null };
globalThis.mongooseCache = cache;

export async function connectToDatabase() {
  if (cache.conn) return cache.conn;
  const parsed = envSchema.safeParse({ MONGODB_URI: process.env.MONGODB_URI, MONGODB_DB_NAME: process.env.MONGODB_DB_NAME });
  if (!parsed.success) throw new Error("MongoDB is not configured. Set MONGODB_URI and MONGODB_DB_NAME.");
  cache.promise ??= mongoose.connect(parsed.data.MONGODB_URI, { dbName: parsed.data.MONGODB_DB_NAME, serverSelectionTimeoutMS: 10000, maxPoolSize: 10 });
  cache.conn = await cache.promise;
  return cache.conn;
}
