/**
 * POST /api/cron/trigger
 *
 * Called by the Cloudflare Worker cron job every hour.
 * Checks which projects need auto-backup, calls their SaaS webhooks.
 * Protected by CRON_SECRET bearer token.
 */

import { NextRequest, NextResponse } from "next/server";
import { listAutoBackupProjects } from "@/lib/db/projects";
import { createCronLog } from "@/lib/db/cron-logs";
import { isUrlSafe, resolveAndValidateUrl } from "@/lib/url";

const VALID_INTERVALS = [1, 12, 24];

/**
 * Check whether a project should be triggered this hour.
 * Uses simple modulo: fires when current UTC hour is divisible by interval.
 */
function shouldTrigger(interval: number, now: Date): boolean {
  if (!VALID_INTERVALS.includes(interval)) return false;
  const hour = now.getUTCHours();
  return hour % interval === 0;
}

export async function POST(request: NextRequest) {
  // Auth: verify CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  let projects;
  try {
    projects = await listAutoBackupProjects();
  } catch (error) {
    console.error("Cron trigger: failed to list projects:", error);
    return NextResponse.json(
      { error: "Failed to query projects" },
      { status: 500 },
    );
  }

  const summary = { total: projects.length, triggered: 0, skipped: 0, failed: 0 };

  for (const project of projects) {
    // Skip projects without a webhook URL configured
    if (!project.auto_backup_webhook) {
      summary.skipped++;
      continue;
    }

    // Check if this project should run this hour
    if (!shouldTrigger(project.auto_backup_interval, now)) {
      void createCronLog({
        projectId: project.id,
        status: "skipped",
      }).catch((err) => console.error("Cron log write failed:", err));
      summary.skipped++;
      continue;
    }

    // SSRF check: static validation + DNS resolution to block rebinding attacks
    if (!isUrlSafe(project.auto_backup_webhook)) {
      void createCronLog({
        projectId: project.id,
        status: "failed",
        error: "SSRF blocked: webhook URL targets a private/internal address",
      }).catch((err) => console.error("Cron log write failed:", err));
      summary.failed++;
      continue;
    }

    const dnsCheck = await resolveAndValidateUrl(project.auto_backup_webhook);
    if (!dnsCheck.safe) {
      void createCronLog({
        projectId: project.id,
        status: "failed",
        error: `SSRF blocked: ${dnsCheck.reason}`,
      }).catch((err) => console.error("Cron log write failed:", err));
      summary.failed++;
      continue;
    }

    // Trigger the SaaS webhook
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
        summary.triggered++;
      } else {
        const body = await res.text().catch(() => "");
        void createCronLog({
          projectId: project.id,
          status: "failed",
          responseCode: res.status,
          error: body.slice(0, 500),
          durationMs,
        }).catch((err) => console.error("Cron log write failed:", err));
        summary.failed++;
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
      summary.failed++;
    }
  }

  return NextResponse.json(summary);
}
