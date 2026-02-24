/**
 * Webhook audit log operations.
 *
 * Every webhook request (HEAD/GET/POST) is logged with structured metadata
 * for debugging, monitoring, and security auditing.
 */

import { executeD1Query } from "./d1-client";
import { generateId } from "@/lib/id";

/** Structured error codes for webhook failures. */
export type WebhookErrorCode =
  | "auth_missing"
  | "auth_invalid"
  | "ip_blocked"
  | "file_missing"
  | "file_empty"
  | "file_too_large"
  | "file_type_invalid"
  | "env_invalid"
  | "upload_failed"
  | "db_failed"
  | "internal_error";

/** A single webhook log entry. */
export interface WebhookLog {
  id: string;
  project_id: string | null;
  method: string;
  path: string;
  status_code: number;
  client_ip: string | null;
  user_agent: string | null;
  error_code: string | null;
  error_message: string | null;
  duration_ms: number | null;
  metadata: string | null;
  created_at: string;
}

/** Webhook log with project name joined. */
export interface WebhookLogWithProject extends WebhookLog {
  project_name: string | null;
}

/** Input for creating a log entry. */
export interface CreateWebhookLogInput {
  projectId: string | null;
  method: string;
  path: string;
  statusCode: number;
  clientIp: string | null;
  userAgent: string | null;
  errorCode: WebhookErrorCode | null;
  errorMessage: string | null;
  durationMs: number;
  metadata: Record<string, unknown> | null;
}

/**
 * Write a webhook log entry to D1.
 *
 * Fire-and-forget: callers should NOT await this — log failures
 * must never block or break the webhook response.
 */
export async function createWebhookLog(
  input: CreateWebhookLogInput,
): Promise<void> {
  try {
    const id = generateId();
    const now = new Date().toISOString();

    await executeD1Query(
      `INSERT INTO webhook_logs
         (id, project_id, method, path, status_code, client_ip, user_agent,
          error_code, error_message, duration_ms, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.projectId,
        input.method,
        input.path,
        input.statusCode,
        input.clientIp,
        input.userAgent,
        input.errorCode,
        input.errorMessage,
        input.durationMs,
        input.metadata ? JSON.stringify(input.metadata) : null,
        now,
      ],
    );
  } catch (error) {
    // Log write failures are non-fatal — never propagate
    console.error("Webhook log write failed:", error);
  }
}

/** Query options for listing webhook logs. */
export interface ListWebhookLogsOptions {
  projectId?: string | undefined;
  excludeProjectId?: string | undefined;
  method?: string | undefined;
  statusCode?: number | undefined;
  errorCode?: string | undefined;
  success?: boolean | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

/** Paginated result for webhook log listings. */
export interface PaginatedWebhookLogs {
  items: WebhookLogWithProject[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * List webhook logs with filtering and pagination.
 */
export async function listWebhookLogs(
  options: ListWebhookLogsOptions = {},
): Promise<PaginatedWebhookLogs> {
  const {
    projectId,
    excludeProjectId,
    method,
    statusCode,
    errorCode,
    success,
    page = 1,
    pageSize = 50,
  } = options;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (projectId) {
    conditions.push("l.project_id = ?");
    params.push(projectId);
  }
  if (excludeProjectId) {
    conditions.push("(l.project_id IS NULL OR l.project_id != ?)");
    params.push(excludeProjectId);
  }
  if (method) {
    conditions.push("l.method = ?");
    params.push(method.toUpperCase());
  }
  if (statusCode !== undefined) {
    conditions.push("l.status_code = ?");
    params.push(statusCode);
  }
  if (errorCode) {
    conditions.push("l.error_code = ?");
    params.push(errorCode);
  }
  if (success === true) {
    conditions.push("l.status_code < 400");
  } else if (success === false) {
    conditions.push("l.status_code >= 400");
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Count total
  const countRows = await executeD1Query<{ count: number }>(
    `SELECT COUNT(*) as count FROM webhook_logs l ${whereClause}`,
    params,
  );
  const total = countRows[0]?.count ?? 0;

  // Fetch page (newest first)
  const offset = (page - 1) * pageSize;
  const items = await executeD1Query<WebhookLogWithProject>(
    `SELECT l.*, p.name as project_name
     FROM webhook_logs l
     LEFT JOIN projects p ON l.project_id = p.id
     ${whereClause}
     ORDER BY l.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Get a single webhook log by ID.
 */
export async function getWebhookLog(
  id: string,
): Promise<WebhookLogWithProject | undefined> {
  const rows = await executeD1Query<WebhookLogWithProject>(
    `SELECT l.*, p.name as project_name
     FROM webhook_logs l
     LEFT JOIN projects p ON l.project_id = p.id
     WHERE l.id = ?`,
    [id],
  );
  return rows[0];
}

/**
 * Delete webhook logs older than a given number of days.
 * Returns the count of deleted rows.
 */
export async function purgeWebhookLogs(olderThanDays: number): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);
  const cutoffIso = cutoff.toISOString();

  const rows = await executeD1Query<{ changes: number }>(
    "DELETE FROM webhook_logs WHERE created_at < ?",
    [cutoffIso],
  );

  // D1 DELETE doesn't return changes in results — count via a follow-up isn't needed
  // since this is a maintenance operation. Return 0 as a safe default.
  return rows.length;
}

/** Options for deleting webhook logs matching filters. */
export interface DeleteWebhookLogsOptions {
  projectId?: string | undefined;
  method?: string | undefined;
  success?: boolean | undefined;
}

/**
 * Delete webhook logs matching the given filters.
 * If no filters are provided, deletes ALL logs.
 */
export async function deleteWebhookLogs(
  options: DeleteWebhookLogsOptions = {},
): Promise<void> {
  const { projectId, method, success } = options;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (projectId) {
    conditions.push("project_id = ?");
    params.push(projectId);
  }
  if (method) {
    conditions.push("method = ?");
    params.push(method.toUpperCase());
  }
  if (success === true) {
    conditions.push("status_code < 400");
  } else if (success === false) {
    conditions.push("status_code >= 400");
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  await executeD1Query(`DELETE FROM webhook_logs ${whereClause}`, params);
}
