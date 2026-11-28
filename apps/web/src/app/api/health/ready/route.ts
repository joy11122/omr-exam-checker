import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectToDatabase();
    const database = mongoose.connection.db;
    if (!database) throw new Error("MongoDB connection is unavailable.");
    await database.admin().ping();

    return NextResponse.json(
      { status: "ready" },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch {
    console.error("Readiness probe failed.");
    return NextResponse.json(
      { status: "not_ready" },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "Retry-After": "15",
        },
      },
    );
  }
}
