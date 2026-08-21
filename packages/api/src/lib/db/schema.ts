/**
 * D1 schema definitions and initialization.
 *
 * Tables: categories, projects, backups, webhook_logs, cron_logs
 */

import type { D1Adapter } from "../../runtime";

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

CREATE TABLE IF NOT EXISTS cron_logs (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  response_code INTEGER,
  error TEXT,
  duration_ms INTEGER,
  triggered_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_backups_project_id ON backups(project_id);
CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at);
CREATE INDEX IF NOT EXISTS idx_projects_webhook_token ON projects(webhook_token);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_project_id ON webhook_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_status_code ON webhook_logs(status_code);
CREATE INDEX IF NOT EXISTS idx_cron_logs_project_id ON cron_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_cron_logs_triggered_at ON cron_logs(triggered_at);
CREATE INDEX IF NOT EXISTS idx_cron_logs_status ON cron_logs(status);

CREATE TABLE IF NOT EXISTS _test_marker (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const DIRECT_UPLOADS_SQL = `
CREATE TABLE IF NOT EXISTS direct_uploads (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  file_key TEXT NOT NULL UNIQUE,
  staging_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  declared_size INTEGER NOT NULL,
  environment TEXT,
  tag TEXT,
  sender_ip TEXT,
  status TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  purge_after INTEGER NOT NULL,
  reap_until INTEGER NOT NULL,
  lease_expires_at INTEGER,
  lease_token TEXT,
  next_gc_at INTEGER NOT NULL,
  purged_at INTEGER,
  backup_id TEXT REFERENCES backups(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_direct_uploads_project_id ON direct_uploads(project_id);
CREATE INDEX IF NOT EXISTS idx_direct_uploads_gc ON direct_uploads(next_gc_at);
CREATE INDEX IF NOT EXISTS idx_direct_uploads_project_created
  ON direct_uploads(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_direct_uploads_project_status_purged
  ON direct_uploads(project_id, status, purged_at);
CREATE INDEX IF NOT EXISTS idx_direct_uploads_status_purged_global
  ON direct_uploads(status, purged_at);
CREATE INDEX IF NOT EXISTS idx_direct_uploads_project_status_completed
  ON direct_uploads(project_id, status, completed_at);
CREATE INDEX IF NOT EXISTS idx_direct_uploads_status_completed
  ON direct_uploads(status, completed_at);
`;

/**
 * Initialize the D1 schema. Safe to call multiple times (uses IF NOT EXISTS).
 */
export async function initializeSchema(db: D1Adapter): Promise<void> {
  const statements = SCHEMA_SQL.split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const sql of statements) {
    await db.query(sql);
  }

  // Migrations: add columns idempotently (D1 doesn't support IF NOT EXISTS for ALTER)
  const migrations = [
    "ALTER TABLE projects ADD COLUMN allowed_ips TEXT",
    "ALTER TABLE projects ADD COLUMN category_id TEXT REFERENCES categories(id) ON DELETE SET NULL",
    "ALTER TABLE projects ADD COLUMN auto_backup_enabled INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE projects ADD COLUMN auto_backup_interval INTEGER NOT NULL DEFAULT 24",
    "ALTER TABLE projects ADD COLUMN auto_backup_webhook TEXT",
    "ALTER TABLE projects ADD COLUMN auto_backup_header_key TEXT",
    "ALTER TABLE projects ADD COLUMN auto_backup_header_value TEXT",
    "ALTER TABLE backups ADD COLUMN file_type TEXT NOT NULL DEFAULT 'unknown'",
  ];
  for (const sql of migrations) {
    try {
      await db.query(sql);
    } catch {
      // Column already exists — safe to ignore
    }
  }

  const backfills = [
    "UPDATE backups SET file_type = 'json' WHERE is_single_json = 1 AND file_type = 'unknown'",
    "UPDATE backups SET file_type = 'zip' WHERE is_single_json = 0 AND file_type = 'unknown'",
  ];
  for (const sql of backfills) {
    try {
      await db.query(sql);
    } catch {
      // Backfill may fail if file_type column doesn't exist yet (first run) — safe to ignore
    }
  }

  const postMigrationIndexes = [
    "CREATE INDEX IF NOT EXISTS idx_projects_category_id ON projects(category_id)",
    "CREATE INDEX IF NOT EXISTS idx_backups_file_type ON backups(file_type)",
  ];
  for (const sql of postMigrationIndexes) {
    await db.query(sql);
  }

  for (const sql of DIRECT_UPLOADS_SQL.split(";")
    .map((s) => s.trim())
    .filter(Boolean)) {
    await db.query(sql);
  }

  const duplicates = await db.query<{ file_key: string; n: number }>(
    "SELECT file_key, COUNT(*) AS n FROM backups GROUP BY file_key HAVING COUNT(*) > 1",
  );
  if (duplicates.results.length > 0) {
    throw new Error(
      `Cannot create unique index on backups.file_key: ${duplicates.results.length} duplicate key(s)`,
    );
  }
  await db.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_backups_file_key ON backups(file_key)",
  );

  // Insert test marker (E2E safety: verify bound D1 is the test database)
  await db.query(
    "INSERT OR IGNORE INTO _test_marker(id, created_at) VALUES ('e2e-test-db', datetime('now'))",
  );
}
