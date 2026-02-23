import { NextRequest, NextResponse } from "next/server";
import { listBackups } from "@/lib/db/backups";

/**
 * GET /api/backups — List all backups, optionally filtered by project.
 *
 * Query params:
 *   - projectId: filter by project (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("projectId") ?? undefined;
    const backups = await listBackups(projectId);
    return NextResponse.json(backups);
  } catch (error) {
    console.error("Failed to list backups:", error);
    return NextResponse.json(
      { error: "Failed to list backups" },
      { status: 500 },
    );
  }
}
