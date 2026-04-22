import { NextRequest, NextResponse } from "next/server";
import { listBackups, listEnvironments, deleteBackups } from "@/lib/db/backups";
import { listProjects } from "@/lib/db/projects";
import { deleteFromR2 } from "@/lib/r2/client";

/**
 * GET /api/backups — List backups with filtering, search, sorting, and pagination.
 *
 * Query params:
 *   - projectId: filter by project (optional)
 *   - search: search by project name, tag, or backup ID (optional)
 *   - environment: filter by environment (optional)
 *   - sortBy: "created_at" | "file_size" | "project_name" (default: "created_at")
 *   - sortOrder: "asc" | "desc" (default: "desc")
 *   - page: page number, 1-based (default: 1)
 *   - pageSize: items per page (default: 20, max: 100)
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;

    const projectId = sp.get("projectId") ?? undefined;
    const search = sp.get("search") ?? undefined;
    const environment = sp.get("environment") ?? undefined;
    const sortBy = parseSortBy(sp.get("sortBy"));
    const sortOrder = parseSortOrder(sp.get("sortOrder"));
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(sp.get("pageSize") ?? "20", 10) || 20));

    const [result, environments, projects] = await Promise.all([
      listBackups({
        projectId,
        search,
        environment,
        sortBy,
        sortOrder,
        page,
        pageSize,
      }),
      listEnvironments(),
      listProjects(),
    ]);

    const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));

    return NextResponse.json({ ...result, environments, projects: projectOptions });
  } catch (error) {
    console.error("Failed to list backups:", error);
    return NextResponse.json(
      { error: "Failed to list backups" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/backups — Batch delete backups.
 *
 * Body: { ids: string[] }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json() as { ids?: unknown };
    const ids = body.ids;

    if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== "string")) {
      return NextResponse.json(
        { error: "ids must be a non-empty array of strings" },
        { status: 400 },
      );
    }

    if (ids.length > 50) {
      return NextResponse.json(
        { error: "Maximum 50 backups can be deleted at once" },
        { status: 400 },
      );
    }

    const keys = await deleteBackups(ids as string[]);

    // Clean up R2 files (non-blocking errors)
    for (const { fileKey, jsonKey } of keys) {
      try {
        await deleteFromR2(fileKey);
        if (jsonKey) {
          await deleteFromR2(jsonKey);
        }
      } catch (r2Error) {
        console.error("R2 cleanup error (non-fatal):", r2Error);
      }
    }

    return NextResponse.json({ success: true, deleted: keys.length });
  } catch (error) {
    console.error("Failed to batch delete backups:", error);
    return NextResponse.json(
      { error: "Failed to batch delete backups" },
      { status: 500 },
    );
  }
}

// --- Helpers ---

function parseSortBy(value: string | null): "created_at" | "file_size" | "project_name" {
  if (value === "file_size" || value === "project_name") return value;
  return "created_at";
}

function parseSortOrder(value: string | null): "asc" | "desc" {
  if (value === "asc") return "asc";
  return "desc";
}
