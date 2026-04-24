/**
 * Project database operations.
 */

import type { D1Adapter } from "../../runtime";
import { generateId, generateWebhookToken } from "../id";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  webhook_token: string;
  allowed_ips: string | null;
  category_id: string | null;
  auto_backup_enabled: number;
  auto_backup_interval: number;
  auto_backup_webhook: string | null;
  auto_backup_header_key: string | null;
  auto_backup_header_value: string | null;
  created_at: string;
  updated_at: string;
}

async function q<T>(
  db: D1Adapter,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const { results } = await db.query<T>(sql, params);
  return results;
}

/**
 * List all projects, ordered by creation date descending.
 */
export async function listProjects(db: D1Adapter): Promise<Project[]> {
  return q<Project>(
    db,
    "SELECT * FROM projects ORDER BY created_at DESC",
  );
}

/**
 * Get a single project by ID.
 */
export async function getProject(
  db: D1Adapter,
  id: string,
): Promise<Project | undefined> {
  const rows = await q<Project>(db, "SELECT * FROM projects WHERE id = ?", [id]);
  return rows[0];
}

/**
 * Get a project by its webhook token.
 */
export async function getProjectByToken(
  db: D1Adapter,
  token: string,
): Promise<Project | undefined> {
  const rows = await q<Project>(
    db,
    "SELECT * FROM projects WHERE webhook_token = ?",
    [token],
  );
  return rows[0];
}

/**
 * Create a new project.
 */
export async function createProject(
  db: D1Adapter,
  name: string,
  description?: string,
): Promise<Project> {
  const id = generateId();
  const token = generateWebhookToken();
  const now = new Date().toISOString();

  await q(
    db,
    "INSERT INTO projects (id, name, description, webhook_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, name, description ?? null, token, now, now],
  );

  return { id, name, description: description ?? null, webhook_token: token, allowed_ips: null, category_id: null, auto_backup_enabled: 0, auto_backup_interval: 24, auto_backup_webhook: null, auto_backup_header_key: null, auto_backup_header_value: null, created_at: now, updated_at: now };
}

/**
 * Update a project's name, description, allowed IPs, category, and auto-backup settings.
 */
export async function updateProject(
  db: D1Adapter,
  id: string,
  data: {
    name?: string | undefined;
    description?: string | undefined;
    allowed_ips?: string | null | undefined;
    category_id?: string | null | undefined;
    auto_backup_enabled?: number | undefined;
    auto_backup_interval?: number | undefined;
    auto_backup_webhook?: string | null | undefined;
    auto_backup_header_key?: string | null | undefined;
    auto_backup_header_value?: string | null | undefined;
  },
): Promise<Project | undefined> {
  const existing = await getProject(db, id);
  if (!existing) return undefined;

  const name = data.name ?? existing.name;
  const description = data.description ?? existing.description;
  const allowed_ips = data.allowed_ips !== undefined ? data.allowed_ips : existing.allowed_ips;
  const category_id = data.category_id !== undefined ? data.category_id : existing.category_id;
  const auto_backup_enabled = data.auto_backup_enabled !== undefined ? data.auto_backup_enabled : existing.auto_backup_enabled;
  const auto_backup_interval = data.auto_backup_interval !== undefined ? data.auto_backup_interval : existing.auto_backup_interval;
  const auto_backup_webhook = data.auto_backup_webhook !== undefined ? data.auto_backup_webhook : existing.auto_backup_webhook;
  const auto_backup_header_key = data.auto_backup_header_key !== undefined ? data.auto_backup_header_key : existing.auto_backup_header_key;
  const auto_backup_header_value = data.auto_backup_header_value !== undefined ? data.auto_backup_header_value : existing.auto_backup_header_value;
  const now = new Date().toISOString();

  await q(
    db,
    `UPDATE projects SET name = ?, description = ?, allowed_ips = ?, category_id = ?,
     auto_backup_enabled = ?, auto_backup_interval = ?, auto_backup_webhook = ?,
     auto_backup_header_key = ?, auto_backup_header_value = ?, updated_at = ? WHERE id = ?`,
    [name, description, allowed_ips, category_id, auto_backup_enabled, auto_backup_interval, auto_backup_webhook, auto_backup_header_key, auto_backup_header_value, now, id],
  );

  return { ...existing, name, description, allowed_ips, category_id, auto_backup_enabled, auto_backup_interval, auto_backup_webhook, auto_backup_header_key, auto_backup_header_value, updated_at: now };
}

/**
 * Delete a project by ID. Cascades to backups.
 */
export async function deleteProject(
  db: D1Adapter,
  id: string,
): Promise<boolean> {
  const existing = await getProject(db, id);
  if (!existing) return false;

  await q(db, "DELETE FROM projects WHERE id = ?", [id]);
  return true;
}

/**
 * Regenerate a project's webhook token.
 */
export async function regenerateToken(
  db: D1Adapter,
  id: string,
): Promise<string | undefined> {
  const existing = await getProject(db, id);
  if (!existing) return undefined;

  const token = generateWebhookToken();
  const now = new Date().toISOString();

  await q(
    db,
    "UPDATE projects SET webhook_token = ?, updated_at = ? WHERE id = ?",
    [token, now, id],
  );

  return token;
}

/**
 * List all projects that have auto-backup enabled with a configured webhook.
 */
export async function listAutoBackupProjects(
  db: D1Adapter,
): Promise<Project[]> {
  return q<Project>(
    db,
    "SELECT * FROM projects WHERE auto_backup_enabled = 1 AND auto_backup_webhook IS NOT NULL",
  );
}
