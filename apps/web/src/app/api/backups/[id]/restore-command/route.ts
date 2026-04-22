import { NextResponse } from "next/server";
import { getBackup } from "@/lib/db/backups";
import { getProject } from "@/lib/db/projects";
import { buildBaseUrl } from "@/lib/hosts";

/**
 * GET /api/backups/[id]/restore-command — Generate a restore curl command.
 *
 * Assembles the command server-side so the frontend never receives
 * the raw webhook_token. The token is embedded only in the returned
 * command string that the user copies.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const backup = await getBackup(id);

    if (!backup) {
      return NextResponse.json({ error: "Backup not found" }, { status: 404 });
    }

    const project = await getProject(backup.project_id);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const baseUrl = buildBaseUrl(request);
    const command = `curl ${baseUrl}/api/restore/${backup.id} \\\n  -H "Authorization: Bearer ${project.webhook_token}"`;

    return NextResponse.json({ command });
  } catch (error) {
    console.error("Failed to generate restore command:", error);
    return NextResponse.json(
      { error: "Failed to generate restore command" },
      { status: 500 },
    );
  }
}
