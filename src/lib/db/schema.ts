/**
 * D1 schema definitions and initialization.
 *
 * Tables: projects, backups
 */

import { executeD1Query } from "./d1-client";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  webhook_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS backups (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment TEXT,
  sender_ip TEXT NOT NULL,
  tag TEXT,
  file_key TEXT NOT NULL,
  json_key TEXT,
  file_size INTEGER NOT NULL,
  is_single_json INTEGER NOT NULL DEFAULT 0,
  json_extracted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_backups_project_id ON backups(project_id);
CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at);
CREATE INDEX IF NOT EXISTS idx_projects_webhook_token ON projects(webhook_token);
`;

/**
 * Initialize the D1 schema. Safe to call multiple times (uses IF NOT EXISTS).
 */
export async function initializeSchema(): Promise<void> {
  const statements = SCHEMA_SQL.split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const sql of statements) {
    await executeD1Query(sql);
  }
}
