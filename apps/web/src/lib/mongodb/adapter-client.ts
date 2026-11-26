import "server-only";
import { MongoClient } from "mongodb";

// The adapter receives an unconnected client. The driver opens its pool lazily
// on the first database operation, so production builds do not require Atlas access.
const client = new MongoClient(process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/omr_exam_checker");
export const clientPromise = Promise.resolve(client);
