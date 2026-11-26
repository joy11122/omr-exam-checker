import "server-only";
import { MongoClient } from "mongodb";
const client = new MongoClient(process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/omr_exam_checker");
export const clientPromise = client.connect();
