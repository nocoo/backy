/**
 * Project database operations.
 */

import { executeD1Query } from "./d1-client";
import { generateId, generateWebhookToken } from "@/lib/id";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  webhook_token: string;
  allowed_ips: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * List all projects, ordered by creation date descending.
 */
export async function listProjects(): Promise<Project[]> {
  return executeD1Query<Project>(
    "SELECT * FROM projects ORDER BY created_at DESC",
  );
}

/**
 * Get a single project by ID.
 */
export async function getProject(id: string): Promise<Project | undefined> {
  const rows = await executeD1Query<Project>(
    "SELECT * FROM projects WHERE id = ?",
    [id],
  );
  return rows[0];
}

/**
 * Get a project by its webhook token.
 */
export async function getProjectByToken(
  token: string,
): Promise<Project | undefined> {
  const rows = await executeD1Query<Project>(
    "SELECT * FROM projects WHERE webhook_token = ?",
    [token],
  );
  return rows[0];
}

/**
 * Create a new project.
 */
export async function createProject(
  name: string,
  description?: string,
): Promise<Project> {
  const id = generateId();
  const token = generateWebhookToken();
  const now = new Date().toISOString();

  await executeD1Query(
    "INSERT INTO projects (id, name, description, webhook_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, name, description ?? null, token, now, now],
  );

  return { id, name, description: description ?? null, webhook_token: token, allowed_ips: null, created_at: now, updated_at: now };
}

/**
 * Update a project's name, description, and allowed IPs.
 */
export async function updateProject(
  id: string,
  data: { name?: string | undefined; description?: string | undefined; allowed_ips?: string | null | undefined },
): Promise<Project | undefined> {
  const existing = await getProject(id);
  if (!existing) return undefined;

  const name = data.name ?? existing.name;
  const description = data.description ?? existing.description;
  const allowed_ips = data.allowed_ips !== undefined ? data.allowed_ips : existing.allowed_ips;
  const now = new Date().toISOString();

  await executeD1Query(
    "UPDATE projects SET name = ?, description = ?, allowed_ips = ?, updated_at = ? WHERE id = ?",
    [name, description, allowed_ips, now, id],
  );

  return { ...existing, name, description, allowed_ips, updated_at: now };
}

/**
 * Delete a project by ID. Cascades to backups.
 */
export async function deleteProject(id: string): Promise<boolean> {
  const existing = await getProject(id);
  if (!existing) return false;

  await executeD1Query("DELETE FROM projects WHERE id = ?", [id]);
  return true;
}

/**
 * Regenerate a project's webhook token.
 */
export async function regenerateToken(
  id: string,
): Promise<string | undefined> {
  const existing = await getProject(id);
  if (!existing) return undefined;

  const token = generateWebhookToken();
  const now = new Date().toISOString();

  await executeD1Query(
    "UPDATE projects SET webhook_token = ?, updated_at = ? WHERE id = ?",
    [token, now, id],
  );

  return token;
}
