import { NextResponse } from "next/server";
import { initializeSchema } from "@/lib/db/schema";

/**
 * POST /api/db/init — Initialize D1 schema (idempotent).
 */
export async function POST() {
  try {
    await initializeSchema();
    return NextResponse.json({ success: true, message: "Schema initialized" });
  } catch (error) {
    console.error("Schema initialization failed:", error);
    return NextResponse.json(
      { error: "Schema initialization failed" },
      { status: 500 },
    );
  }
}
