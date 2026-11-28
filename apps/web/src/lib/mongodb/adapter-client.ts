import "server-only";
import { MongoClient } from "mongodb";

// The adapter receives an unconnected client. The driver opens its pool lazily
// on the first database operation, so production builds do not require Atlas access.
const client = new MongoClient(process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/omr_exam_checker", {\n  maxPoolSize: 10,\n  minPoolSize: 1,\n  maxIdleTimeMS: 30000,\n  waitQueueTimeoutMS: 10000,\n  serverSelectionTimeoutMS: 8000,\n  connectTimeoutMS: 10000,\n  retryReads: true,\n  retryWrites: true,\n});
export const clientPromise = Promise.resolve(client);
