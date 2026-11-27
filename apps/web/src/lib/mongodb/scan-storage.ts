import "server-only";

import { GridFSBucket, ObjectId } from "mongodb";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/mongodb/client";

const BUCKET_NAME = "omrScans";

function getBucket() {
  const database = mongoose.connection.db;
  if (!database) throw new Error("MongoDB is not connected.");
  return new GridFSBucket(database, { bucketName: BUCKET_NAME });
}

export async function storeScanImage(input: {
  bytes: Buffer;
  filename: string;
  mimeType: string;
  institutionId: string;
  sha256: string;
}) {
  await connectToDatabase();
  const bucket = getBucket();
  const fileId = new ObjectId();
  await new Promise<void>((resolve, reject) => {
    const upload = bucket.openUploadStreamWithId(fileId, input.filename, {
      contentType: input.mimeType,
      metadata: {
        institutionId: input.institutionId,
        sha256: input.sha256,
        purpose: "omr-original-scan",
      },
    });
    upload.once("error", reject);
    upload.once("finish", () => resolve());
    upload.end(input.bytes);
  });
  return fileId;
}

export async function deleteScanImage(fileId: mongoose.Types.ObjectId | ObjectId) {
  await connectToDatabase();
  try {
    await getBucket().delete(new ObjectId(String(fileId)));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
}

export async function readScanImage(fileId: string) {
  await connectToDatabase();
  if (!ObjectId.isValid(fileId)) return null;
  const bucket = getBucket();
  const id = new ObjectId(fileId);
  const files = await bucket.find({ _id: id }).limit(1).toArray();
  if (!files[0]) return null;
  const chunks: Buffer[] = [];
  for await (const chunk of bucket.openDownloadStream(id)) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return {
    bytes: Buffer.concat(chunks),
    contentType: files[0].contentType ?? "application/octet-stream",
    length: files[0].length,
  };
}
