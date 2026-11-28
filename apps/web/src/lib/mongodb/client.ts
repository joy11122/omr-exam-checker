import "server-only";
import mongoose from "mongoose";
import { validateServerEnvironment } from "@/lib/security/env";

type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
declare global { var mongooseCache: Cache | undefined; }
const cache = globalThis.mongooseCache ?? { conn: null, promise: null };
globalThis.mongooseCache = cache;

export async function connectToDatabase() {
  if (cache.conn) return cache.conn;
  const env = validateServerEnvironment();
  cache.promise ??= mongoose.connect(env.MONGODB_URI, {
    dbName: env.MONGODB_DB_NAME,
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: 20,
    minPoolSize: 1,
    maxIdleTimeMS: 30000,
    waitQueueTimeoutMS: 10000,
  });
  try {
    cache.conn = await cache.promise;
    return cache.conn;
  } catch (error) {
    cache.promise = null;
    throw error;
  }
}
