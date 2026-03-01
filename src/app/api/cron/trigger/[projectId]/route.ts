/**
 * POST /api/cron/trigger/[projectId]
 *
 * Manually trigger a single auto-backup for a specific project.
 * Behaves identically to the cron trigger but for one project only.
 * Records the attempt in cron_logs so it appears in the Cron Logs page.
 */

import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/lib/db/projects";
import { createCronLog } from "@/lib/db/cron-logs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;

  // Fetch project
  let project;
  try {
    project = await getProject(projectId);
  } catch (error) {
    console.error("Manual trigger: failed to fetch project:", error);
    return NextResponse.json(
      { error: "Failed to fetch project" },
      { status: 500 },
    );
  }

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (!project.auto_backup_webhook) {
    return NextResponse.json(
      { error: "No webhook URL configured for auto-backup" },
      { status: 400 },
    );
  }

  // Fire the webhook (same logic as cron/trigger/route.ts)
  const start = Date.now();
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (project.auto_backup_header_key && project.auto_backup_header_value) {
      headers[project.auto_backup_header_key] = project.auto_backup_header_value;
    }

    const res = await fetch(project.auto_backup_webhook, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(30_000),
    });

    const durationMs = Date.now() - start;

    if (res.ok) {
      void createCronLog({
        projectId: project.id,
        status: "success",
        responseCode: res.status,
        durationMs,
      }).catch((err) => console.error("Cron log write failed:", err));

      return NextResponse.json({
        status: "success",
        responseCode: res.status,
        durationMs,
      });
    } else {
      const body = await res.text().catch(() => "");
      void createCronLog({
        projectId: project.id,
        status: "failed",
        responseCode: res.status,
        error: body.slice(0, 500),
        durationMs,
      }).catch((err) => console.error("Cron log write failed:", err));

      return NextResponse.json({
        status: "failed",
        responseCode: res.status,
        error: body.slice(0, 500),
        durationMs,
      });
    }
  } catch (error) {
    const durationMs = Date.now() - start;
    const message = error instanceof Error ? error.message : "Unknown error";

    void createCronLog({
      projectId: project.id,
      status: "failed",
      error: message.slice(0, 500),
      durationMs,
    }).catch((err) => console.error("Cron log write failed:", err));

    return NextResponse.json({
      status: "failed",
      error: message.slice(0, 500),
      durationMs,
    });
  }
}
