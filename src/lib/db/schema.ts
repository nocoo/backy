/**
 * D1 schema definitions and initialization.
 *
 * Tables: categories, projects, backups, webhook_logs
 */

import { executeD1Query } from "./d1-client";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6b7280',
  icon TEXT NOT NULL DEFAULT 'folder',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  webhook_token TEXT NOT NULL UNIQUE,
  allowed_ips TEXT,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS webhook_logs (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  client_ip TEXT,
  user_agent TEXT,
  error_code TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_backups_project_id ON backups(project_id);
CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at);
CREATE INDEX IF NOT EXISTS idx_projects_webhook_token ON projects(webhook_token);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_project_id ON webhook_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_status_code ON webhook_logs(status_code);
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

  // Migrations: add columns idempotently (D1 doesn't support IF NOT EXISTS for ALTER)
  const migrations = [
    "ALTER TABLE projects ADD COLUMN allowed_ips TEXT",
    "ALTER TABLE projects ADD COLUMN category_id TEXT REFERENCES categories(id) ON DELETE SET NULL",
  ];
  for (const sql of migrations) {
    try {
      await executeD1Query(sql);
    } catch {
      // Column already exists — safe to ignore
    }
  }

  // Create indexes that depend on migration columns (must run after ALTER TABLE)
  const postMigrationIndexes = [
    "CREATE INDEX IF NOT EXISTS idx_projects_category_id ON projects(category_id)",
  ];
  for (const sql of postMigrationIndexes) {
    await executeD1Query(sql);
  }
}
