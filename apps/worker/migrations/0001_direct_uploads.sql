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

CREATE UNIQUE INDEX IF NOT EXISTS idx_backups_file_key ON backups(file_key);
