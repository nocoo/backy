/**
 * Backup database operations.
 */

import { executeD1Query } from "./d1-client";
import { generateId } from "@/lib/id";

export interface Backup {
  id: string;
  project_id: string;
  environment: string | null;
  sender_ip: string;
  tag: string | null;
  file_key: string;
  json_key: string | null;
  file_size: number;
  is_single_json: number;
  json_extracted: number;
  created_at: string;
  updated_at: string;
}

/** Backup with project name joined. */
export interface BackupWithProject extends Backup {
  project_name: string;
}

/**
 * List all backups, optionally filtered by project, ordered by creation date descending.
 */
export async function listBackups(projectId?: string): Promise<BackupWithProject[]> {
  if (projectId) {
    return executeD1Query<BackupWithProject>(
      `SELECT b.*, p.name as project_name
       FROM backups b
       JOIN projects p ON b.project_id = p.id
       WHERE b.project_id = ?
       ORDER BY b.created_at DESC`,
      [projectId],
    );
  }

  return executeD1Query<BackupWithProject>(
    `SELECT b.*, p.name as project_name
     FROM backups b
     JOIN projects p ON b.project_id = p.id
     ORDER BY b.created_at DESC`,
  );
}

/**
 * Get a single backup by ID.
 */
export async function getBackup(id: string): Promise<BackupWithProject | undefined> {
  const rows = await executeD1Query<BackupWithProject>(
    `SELECT b.*, p.name as project_name
     FROM backups b
     JOIN projects p ON b.project_id = p.id
     WHERE b.id = ?`,
    [id],
  );
  return rows[0];
}

/**
 * Create a new backup record.
 */
export async function createBackup(data: {
  projectId: string;
  environment?: string | undefined;
  senderIp: string;
  tag?: string | undefined;
  fileKey: string;
  jsonKey?: string | undefined;
  fileSize: number;
  isSingleJson: boolean;
  jsonExtracted: boolean;
}): Promise<Backup> {
  const id = generateId();
  const now = new Date().toISOString();

  await executeD1Query(
    `INSERT INTO backups (id, project_id, environment, sender_ip, tag, file_key, json_key, file_size, is_single_json, json_extracted, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.projectId,
      data.environment ?? null,
      data.senderIp,
      data.tag ?? null,
      data.fileKey,
      data.jsonKey ?? null,
      data.fileSize,
      data.isSingleJson ? 1 : 0,
      data.jsonExtracted ? 1 : 0,
      now,
      now,
    ],
  );

  return {
    id,
    project_id: data.projectId,
    environment: data.environment ?? null,
    sender_ip: data.senderIp,
    tag: data.tag ?? null,
    file_key: data.fileKey,
    json_key: data.jsonKey ?? null,
    file_size: data.fileSize,
    is_single_json: data.isSingleJson ? 1 : 0,
    json_extracted: data.jsonExtracted ? 1 : 0,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Update a backup record (for setting json_key after extraction, etc.).
 */
export async function updateBackup(
  id: string,
  data: {
    jsonKey?: string | undefined;
    jsonExtracted?: boolean | undefined;
  },
): Promise<Backup | undefined> {
  const sets: string[] = [];
  const params: (string | number)[] = [];

  if (data.jsonKey !== undefined) {
    sets.push("json_key = ?");
    params.push(data.jsonKey);
  }
  if (data.jsonExtracted !== undefined) {
    sets.push("json_extracted = ?");
    params.push(data.jsonExtracted ? 1 : 0);
  }

  if (sets.length === 0) return getBackup(id) as Promise<Backup | undefined>;

  const now = new Date().toISOString();
  sets.push("updated_at = ?");
  params.push(now);
  params.push(id);

  await executeD1Query(
    `UPDATE backups SET ${sets.join(", ")} WHERE id = ?`,
    params,
  );

  const rows = await executeD1Query<Backup>(
    "SELECT * FROM backups WHERE id = ?",
    [id],
  );
  return rows[0];
}

/**
 * Delete a backup by ID. Returns the file keys that need to be cleaned up from R2.
 */
export async function deleteBackup(id: string): Promise<{ fileKey: string; jsonKey: string | null } | undefined> {
  const rows = await executeD1Query<Backup>(
    "SELECT file_key, json_key FROM backups WHERE id = ?",
    [id],
  );
  const backup = rows[0];
  if (!backup) return undefined;

  await executeD1Query("DELETE FROM backups WHERE id = ?", [id]);
  return { fileKey: backup.file_key, jsonKey: backup.json_key };
}

/**
 * Get all file keys for a project's backups (for bulk R2 cleanup on project deletion).
 */
export async function getBackupFileKeys(projectId: string): Promise<string[]> {
  const rows = await executeD1Query<{ file_key: string; json_key: string | null }>(
    "SELECT file_key, json_key FROM backups WHERE project_id = ?",
    [projectId],
  );

  const keys: string[] = [];
  for (const row of rows) {
    keys.push(row.file_key);
    if (row.json_key) keys.push(row.json_key);
  }
  return keys;
}

/**
 * Count backups for a project.
 */
export async function countBackups(projectId?: string): Promise<number> {
  if (projectId) {
    const rows = await executeD1Query<{ count: number }>(
      "SELECT COUNT(*) as count FROM backups WHERE project_id = ?",
      [projectId],
    );
    return rows[0]?.count ?? 0;
  }

  const rows = await executeD1Query<{ count: number }>(
    "SELECT COUNT(*) as count FROM backups",
  );
  return rows[0]?.count ?? 0;
}
