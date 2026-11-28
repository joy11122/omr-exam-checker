import "server-only";
import { MongoClient } from "mongodb";

// The adapter receives an unconnected client. The driver opens its pool lazily
// on the first database operation, so production builds do not require Atlas access.
const client = new MongoClient(process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/omr_exam_checker", {
  maxPoolSize: 10,
  minPoolSize: 1,
  maxIdleTimeMS: 30000,
  waitQueueTimeoutMS: 10000,
  serverSelectionTimeoutMS: 8000,
  connectTimeoutMS: 10000,
  retryReads: true,
  retryWrites: true,
});
export const clientPromise = Promise.resolve(client);
