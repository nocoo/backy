import {
  listWebhookLogs,
  deleteWebhookLogs,
} from "../lib/db/webhook-logs";
import { json, empty, type HandlerResponse } from "../http/response";

export interface ListWebhookLogsInput {
  projectId?: string | null;
  excludeProjectIds?: string | null;
  excludeClientIps?: string | null;
  method?: string | null;
  statusCode?: string | null;
  errorCode?: string | null;
  success?: string | null;
  page?: string | null;
  pageSize?: string | null;
}

function splitCsv(value: string | null | undefined): string[] | undefined {
  if (!value) return undefined;
  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

export async function listWebhookLogsHandler(
  input: ListWebhookLogsInput,
): Promise<HandlerResponse> {
  try {
    const statusCodeRaw = input.statusCode;
    const statusCode = statusCodeRaw ? parseInt(statusCodeRaw, 10) : undefined;
    const success =
      input.success === "true"
        ? true
        : input.success === "false"
          ? false
          : undefined;
    const page = Math.max(1, parseInt(input.page ?? "1", 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(input.pageSize ?? "50", 10) || 50),
    );

    const result = await listWebhookLogs({
      projectId: input.projectId ?? undefined,
      excludeProjectIds: splitCsv(input.excludeProjectIds),
      excludeClientIps: splitCsv(input.excludeClientIps),
      method: input.method ?? undefined,
      statusCode:
        statusCode !== undefined && !isNaN(statusCode) ? statusCode : undefined,
      errorCode: input.errorCode ?? undefined,
      success,
      page,
      pageSize,
    });
    return json(200, result);
  } catch (error) {
    console.error("Failed to list webhook logs:", error);
    return json(500, { error: "Failed to list webhook logs" });
  }
}

export interface DeleteWebhookLogsInput {
  body: unknown;
}

export async function deleteWebhookLogsHandler(
  input: DeleteWebhookLogsInput,
): Promise<HandlerResponse> {
  try {
    const { projectId, method, success } = (input.body ?? {}) as {
      projectId?: string;
      method?: string;
      success?: boolean;
    };
    await deleteWebhookLogs({ projectId, method, success });
    return json(200, { success: true });
  } catch (error) {
    console.error("Failed to delete webhook logs:", error);
    return json(500, { error: "Failed to delete webhook logs" });
  }
}

// ---------------------------------------------------------------------------
// Cron logs
// ---------------------------------------------------------------------------

import {
  listCronLogs,
  deleteCronLogs,
  type CronLogStatus,
} from "../lib/db/cron-logs";

const VALID_CRON_STATUSES: CronLogStatus[] = [
  "triggered",
  "skipped",
  "success",
  "failed",
];

function parseCronStatus(
  value: string | null | undefined,
): CronLogStatus | undefined {
  if (value && VALID_CRON_STATUSES.includes(value as CronLogStatus)) {
    return value as CronLogStatus;
  }
  return undefined;
}

export interface ListCronLogsInput {
  projectId?: string | null;
  status?: string | null;
  page?: string | null;
  pageSize?: string | null;
}

export async function listCronLogsHandler(
  input: ListCronLogsInput,
): Promise<HandlerResponse> {
  const projectId = input.projectId ?? undefined;
  const status = parseCronStatus(input.status);
  const page = Math.max(1, Number(input.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(input.pageSize) || 50));

  try {
    const result = await listCronLogs({ projectId, status, page, pageSize });
    return json(200, result);
  } catch (error) {
    console.error("Failed to list cron logs:", error);
    return json(500, { error: "Failed to list cron logs" });
  }
}

export interface DeleteCronLogsInput {
  projectId?: string | null;
  status?: string | null;
}

export async function deleteCronLogsHandler(
  input: DeleteCronLogsInput,
): Promise<HandlerResponse> {
  const projectId = input.projectId ?? undefined;
  const status = parseCronStatus(input.status);
  try {
    await deleteCronLogs({ projectId, status });
    return empty(204);
  } catch (error) {
    console.error("Failed to delete cron logs:", error);
    return json(500, { error: "Failed to delete cron logs" });
  }
}
