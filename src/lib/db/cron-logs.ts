/**
 * Cron log database operations.
 *
 * Every cron trigger cycle logs an entry per project with its outcome:
 * triggered, skipped, success, or failed.
 */

import { executeD1Query } from "./d1-client";
import { generateId } from "@/lib/id";

/** Possible cron log statuses. */
export type CronLogStatus = "triggered" | "skipped" | "success" | "failed";

/** A single cron log entry. */
export interface CronLog {
  id: string;
  project_id: string;
  status: CronLogStatus;
  response_code: number | null;
  error: string | null;
  duration_ms: number | null;
  triggered_at: string;
}

/** Cron log with project name joined. */
export interface CronLogWithProject extends CronLog {
  project_name: string | null;
}

/** Input for creating a cron log entry. */
export interface CreateCronLogInput {
  projectId: string;
  status: CronLogStatus;
  responseCode?: number | null;
  error?: string | null;
  durationMs?: number | null;
}

/**
 * Write a cron log entry to D1.
 */
export async function createCronLog(input: CreateCronLogInput): Promise<void> {
  const id = generateId();
  const now = new Date().toISOString();

  await executeD1Query(
    `INSERT INTO cron_logs
       (id, project_id, status, response_code, error, duration_ms, triggered_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.projectId,
      input.status,
      input.responseCode ?? null,
      input.error ?? null,
      input.durationMs ?? null,
      now,
    ],
  );
}

/** Query options for listing cron logs. */
export interface ListCronLogsOptions {
  projectId?: string | undefined;
  status?: CronLogStatus | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

/** Paginated result for cron log listings. */
export interface PaginatedCronLogs {
  items: CronLogWithProject[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * List cron logs with filtering and pagination.
 */
export async function listCronLogs(
  options: ListCronLogsOptions = {},
): Promise<PaginatedCronLogs> {
  const { projectId, status, page = 1, pageSize = 50 } = options;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (projectId) {
    conditions.push("c.project_id = ?");
    params.push(projectId);
  }
  if (status) {
    conditions.push("c.status = ?");
    params.push(status);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Count total
  const countRows = await executeD1Query<{ count: number }>(
    `SELECT COUNT(*) as count FROM cron_logs c ${whereClause}`,
    params,
  );
  const total = countRows[0]?.count ?? 0;

  // Fetch page (newest first)
  const offset = (page - 1) * pageSize;
  const items = await executeD1Query<CronLogWithProject>(
    `SELECT c.*, p.name as project_name
     FROM cron_logs c
     LEFT JOIN projects p ON c.project_id = p.id
     ${whereClause}
     ORDER BY c.triggered_at DESC
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

/** Options for deleting cron logs matching filters. */
export interface DeleteCronLogsOptions {
  projectId?: string | undefined;
  status?: CronLogStatus | undefined;
}

/**
 * Delete cron logs matching the given filters.
 * If no filters are provided, deletes ALL cron logs.
 */
export async function deleteCronLogs(
  options: DeleteCronLogsOptions = {},
): Promise<void> {
  const { projectId, status } = options;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (projectId) {
    conditions.push("project_id = ?");
    params.push(projectId);
  }
  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  await executeD1Query(`DELETE FROM cron_logs ${whereClause}`, params);
}
