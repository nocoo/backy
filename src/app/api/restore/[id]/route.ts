import { NextResponse } from "next/server";
import { getBackup } from "@/lib/db/backups";
import { getProject } from "@/lib/db/projects";
import { createPresignedDownloadUrl } from "@/lib/r2/client";
import { enforceIpRestriction } from "@/lib/ip";

/**
 * GET /api/restore/[id] — Generate a temporary download URL for a backup.
 *
 * This is a public endpoint (no OAuth required). Authentication is via the
 * project's webhook token passed as a query parameter or Bearer token.
 *
 * Usage by AI agents:
 *   GET /api/restore/{backupId}?token={webhookToken}
 *   — or —
 *   GET /api/restore/{backupId}
 *   Authorization: Bearer {webhookToken}
 *
 * Returns a presigned R2 URL valid for 15 minutes.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // --- Auth: token from query param or Authorization header ---
    const url = new URL(request.url);
    let token = url.searchParams.get("token");

    if (!token) {
      const authHeader = request.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        token = authHeader.slice(7);
      }
    }

    if (!token) {
      return NextResponse.json(
        { error: "Missing authentication. Provide ?token= query param or Authorization: Bearer header." },
        { status: 401 },
      );
    }

    // --- Look up backup ---
    const backup = await getBackup(id);
    if (!backup) {
      return NextResponse.json({ error: "Backup not found" }, { status: 404 });
    }

    // --- Verify token matches the project's webhook token ---
    const project = await getProject(backup.project_id);
    if (!project || project.webhook_token !== token) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 403 },
      );
    }

    // --- IP restriction ---
    const ipBlock = enforceIpRestriction(request, project.allowed_ips);
    if (ipBlock) return ipBlock;

    // --- Generate presigned download URL ---
    const downloadUrl = await createPresignedDownloadUrl(backup.file_key);

    return NextResponse.json({
      url: downloadUrl,
      backup_id: backup.id,
      project_id: backup.project_id,
      file_size: backup.file_size,
      expires_in: 900,
    });
  } catch (error) {
    console.error("Restore error:", error);
    return NextResponse.json(
      { error: "Failed to generate restore URL" },
      { status: 500 },
    );
  }
}
