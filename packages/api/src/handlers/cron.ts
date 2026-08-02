import { listAutoBackupProjects, getProject, type Project } from "../lib/db/projects";
import { createCronLog } from "../lib/db/cron-logs";
import { isUrlSafe, resolveAndValidateUrl } from "../lib/url";
import { json, type HandlerResponse } from "../http/response";
import type { D1Adapter, RuntimeContext } from "../runtime";

const VALID_INTERVALS = [1, 12, 24];

interface AutoBackupProject {
  id: string;
  auto_backup_webhook: string;
  auto_backup_interval: number;
  auto_backup_header_key: string | null;
  auto_backup_header_value: string | null;
}

function shouldTrigger(interval: number, now: Date): boolean {
  if (!VALID_INTERVALS.includes(interval)) return false;
  return now.getUTCHours() % interval === 0;
}

interface FireOutcome {
  status: "success" | "failed";
  responseCode?: number;
  error?: string;
  durationMs: number;
}

async function fireProjectWebhook(
  project: AutoBackupProject,
): Promise<FireOutcome> {
  const start = Date.now();
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (project.auto_backup_header_key && project.auto_backup_header_value) {
      headers[project.auto_backup_header_key] =
        project.auto_backup_header_value;
    }
    const res = await fetch(project.auto_backup_webhook, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    const durationMs = Date.now() - start;
    if (res.ok) {
      return { status: "success", responseCode: res.status, durationMs };
    }
    const body = await res.text().catch(() => "");
    return {
      status: "failed",
      responseCode: res.status,
      error: body.slice(0, 500),
      durationMs,
    };
  } catch (error) {
    /* v8 ignore next -- @preserve defensive: thrown values from fetch() are always Error instances; "Unknown error" fallback unreachable */
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      status: "failed",
      error: message.slice(0, 500),
      durationMs: Date.now() - start,
    };
  }
}

function logFireAndForget(
  db: D1Adapter,
  entry: Parameters<typeof createCronLog>[1],
) {
  void createCronLog(db, entry).catch((err) =>
    console.error("Cron log write failed:", err),
  );
}

export interface CronTriggerInput {
  authorization: string | null;
}

export async function cronTriggerHandler(
  input: CronTriggerInput,
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  const cronSecret = ctx.env.CRON_SECRET;
  if (!cronSecret) {
    return json(500, { error: "CRON_SECRET not configured" });
  }
  const auth = input.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (token !== cronSecret) return json(401, { error: "Unauthorized" });

  const now = new Date();
  let projects: AutoBackupProject[];
  try {
    projects = (await listAutoBackupProjects(ctx.db)) as AutoBackupProject[];
  } catch (error) {
    console.error("Cron trigger: failed to list projects:", error);
    return json(500, { error: "Failed to query projects" });
  }

  const summary = {
    total: projects.length,
    triggered: 0,
    skipped: 0,
    failed: 0,
  };

  for (const project of projects) {
    if (!project.auto_backup_webhook) {
      summary.skipped++;
      continue;
    }
    if (!shouldTrigger(project.auto_backup_interval, now)) {
      logFireAndForget(ctx.db, { projectId: project.id, status: "skipped" });
      summary.skipped++;
      continue;
    }
    if (!isUrlSafe(project.auto_backup_webhook, ctx.env)) {
      logFireAndForget(ctx.db, {
        projectId: project.id,
        status: "failed",
        error:
          "SSRF blocked: webhook URL targets a private/internal address",
      });
      summary.failed++;
      continue;
    }
    const dnsCheck = await resolveAndValidateUrl(
      project.auto_backup_webhook,
      ctx.env,
    );
    if (!dnsCheck.safe) {
      logFireAndForget(ctx.db, {
        projectId: project.id,
        status: "failed",
        error: `SSRF blocked: ${dnsCheck.reason}`,
      });
      summary.failed++;
      continue;
    }
    const outcome = await fireProjectWebhook(project);
    logFireAndForget(ctx.db, {
      projectId: project.id,
      status: outcome.status,
      ...(outcome.responseCode !== undefined && {
        responseCode: outcome.responseCode,
      }),
      ...(outcome.error !== undefined && { error: outcome.error }),
      durationMs: outcome.durationMs,
    });
    if (outcome.status === "success") summary.triggered++;
    else summary.failed++;
  }

  return json(200, summary);
}

export interface CronTriggerOneInput {
  projectId: string;
}

export async function cronTriggerOneHandler(
  input: CronTriggerOneInput,
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  let project: Project | undefined;
  try {
    project = await getProject(ctx.db, input.projectId);
  } catch (error) {
    console.error("Manual trigger: failed to fetch project:", error);
    return json(500, { error: "Failed to fetch project" });
  }
  if (!project) return json(404, { error: "Project not found" });
  if (!project.auto_backup_webhook) {
    return json(400, { error: "No webhook URL configured for auto-backup" });
  }

  if (!isUrlSafe(project.auto_backup_webhook, ctx.env)) {
    logFireAndForget(ctx.db, {
      projectId: project.id,
      status: "failed",
      error: "SSRF blocked: webhook URL targets a private/internal address",
    });
    return json(200, {
      status: "failed",
      error: "Webhook URL is not allowed (must be HTTPS, public hostname)",
    });
  }
  const dnsCheck = await resolveAndValidateUrl(
    project.auto_backup_webhook,
    ctx.env,
  );
  if (!dnsCheck.safe) {
    logFireAndForget(ctx.db, {
      projectId: project.id,
      status: "failed",
      error: `SSRF blocked: ${dnsCheck.reason}`,
    });
    return json(200, {
      status: "failed",
      error: `Webhook URL blocked: ${dnsCheck.reason}`,
    });
  }

  const outcome = await fireProjectWebhook(project as AutoBackupProject);
  logFireAndForget(ctx.db, {
    projectId: project.id,
    status: outcome.status,
    ...(outcome.responseCode !== undefined && {
      responseCode: outcome.responseCode,
    }),
    ...(outcome.error !== undefined && { error: outcome.error }),
    durationMs: outcome.durationMs,
  });

  if (outcome.status === "success") {
    return json(200, {
      status: "success",
      ...(outcome.responseCode !== undefined && {
        responseCode: outcome.responseCode,
      }),
      durationMs: outcome.durationMs,
    });
  }
  return json(200, {
    status: "failed",
    ...(outcome.responseCode !== undefined && {
      responseCode: outcome.responseCode,
    }),
    ...(outcome.error !== undefined && { error: outcome.error }),
    durationMs: outcome.durationMs,
  });
}
