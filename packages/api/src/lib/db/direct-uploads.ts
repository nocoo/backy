import type { D1Adapter, D1QueryMeta } from "../../runtime";
import {
  QUOTA_GLOBAL_DAILY_BYTES,
  QUOTA_GLOBAL_HOURLY_BYTES,
  QUOTA_GLOBAL_WRITABLE_ROWS,
  QUOTA_PROJECT_DAILY_BYTES,
  QUOTA_PROJECT_HOURLY_BYTES,
  QUOTA_PROJECT_INITS_PER_60S,
  QUOTA_PROJECT_WRITABLE_BYTES,
  QUOTA_PROJECT_WRITABLE_ROWS,
  WRITABLE_STATUS_SQL,
} from "../direct-upload";

export type DirectUploadStatus =
  | "pending"
  | "completing"
  | "completed"
  | "aborted"
  | "expired";

export interface DirectUploadRow {
  id: string;
  project_id: string | null;
  file_key: string;
  staging_key: string;
  file_name: string;
  content_type: string;
  declared_size: number;
  environment: string | null;
  tag: string | null;
  sender_ip: string | null;
  status: DirectUploadStatus;
  expires_at: number;
  purge_after: number;
  reap_until: number;
  lease_expires_at: number | null;
  lease_token: string | null;
  next_gc_at: number;
  purged_at: number | null;
  backup_id: string | null;
  created_at: number;
  completed_at: number | null;
}

export function changesOf(meta: D1QueryMeta | undefined): number {
  return meta?.changes ?? 0;
}

export async function insertPendingDirectUpload(
  db: D1Adapter,
  row: {
    id: string;
    projectId: string;
    fileKey: string;
    stagingKey: string;
    fileName: string;
    contentType: string;
    declaredSize: number;
    environment: string | null;
    tag: string | null;
    senderIp: string | null;
    expiresAt: number;
    purgeAfter: number;
    reapUntil: number;
    nextGcAt: number;
    createdAt: number;
  },
): Promise<boolean> {
  const hourAgo = row.createdAt - 3600;
  const dayAgo = row.createdAt - 86400;
  const minuteAgo = row.createdAt - 60;
  const result = await db.query(
    `INSERT INTO direct_uploads (
       id, project_id, file_key, staging_key, file_name, content_type,
       declared_size, environment, tag, sender_ip, status,
       expires_at, purge_after, reap_until, next_gc_at, created_at
     )
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?
     WHERE (SELECT COUNT(*) FROM direct_uploads
            WHERE project_id = ? AND purged_at IS NULL AND ${WRITABLE_STATUS_SQL})
           < ${QUOTA_PROJECT_WRITABLE_ROWS}
       AND (SELECT COALESCE(SUM(declared_size), 0) FROM direct_uploads
            WHERE project_id = ? AND purged_at IS NULL AND ${WRITABLE_STATUS_SQL})
           + ? <= ${QUOTA_PROJECT_WRITABLE_BYTES}
       AND (SELECT COUNT(*) FROM direct_uploads
            WHERE project_id = ? AND created_at > ?)
           < ${QUOTA_PROJECT_INITS_PER_60S}
       AND (SELECT COUNT(*) FROM direct_uploads
            WHERE purged_at IS NULL AND ${WRITABLE_STATUS_SQL})
           < ${QUOTA_GLOBAL_WRITABLE_ROWS}
       AND (
             (SELECT COALESCE(SUM(declared_size), 0) FROM direct_uploads
              WHERE project_id = ? AND completed_at IS NOT NULL AND completed_at > ?)
           + (SELECT COALESCE(SUM(declared_size), 0) FROM direct_uploads
              WHERE project_id = ? AND purged_at IS NULL AND ${WRITABLE_STATUS_SQL})
           + ?
           ) <= ${QUOTA_PROJECT_HOURLY_BYTES}
       AND (
             (SELECT COALESCE(SUM(declared_size), 0) FROM direct_uploads
              WHERE completed_at IS NOT NULL AND completed_at > ?)
           + (SELECT COALESCE(SUM(declared_size), 0) FROM direct_uploads
              WHERE purged_at IS NULL AND ${WRITABLE_STATUS_SQL})
           + ?
           ) <= ${QUOTA_GLOBAL_HOURLY_BYTES}
       AND (
             (SELECT COALESCE(SUM(declared_size), 0) FROM direct_uploads
              WHERE project_id = ? AND completed_at IS NOT NULL AND completed_at > ?)
           + (SELECT COALESCE(SUM(declared_size), 0) FROM direct_uploads
              WHERE project_id = ? AND purged_at IS NULL AND ${WRITABLE_STATUS_SQL})
           + ?
           ) <= ${QUOTA_PROJECT_DAILY_BYTES}
       AND (
             (SELECT COALESCE(SUM(declared_size), 0) FROM direct_uploads
              WHERE completed_at IS NOT NULL AND completed_at > ?)
           + (SELECT COALESCE(SUM(declared_size), 0) FROM direct_uploads
              WHERE purged_at IS NULL AND ${WRITABLE_STATUS_SQL})
           + ?
           ) <= ${QUOTA_GLOBAL_DAILY_BYTES}`,
    [
      row.id,
      row.projectId,
      row.fileKey,
      row.stagingKey,
      row.fileName,
      row.contentType,
      row.declaredSize,
      row.environment,
      row.tag,
      row.senderIp,
      row.expiresAt,
      row.purgeAfter,
      row.reapUntil,
      row.nextGcAt,
      row.createdAt,
      row.projectId,
      row.projectId,
      row.declaredSize,
      row.projectId,
      minuteAgo,
      row.projectId,
      hourAgo,
      row.projectId,
      row.declaredSize,
      hourAgo,
      row.declaredSize,
      row.projectId,
      dayAgo,
      row.projectId,
      row.declaredSize,
      dayAgo,
      row.declaredSize,
    ],
  );
  return changesOf(result.meta) > 0;
}

export async function getDirectUpload(
  db: D1Adapter,
  id: string,
  projectId: string,
): Promise<DirectUploadRow | undefined> {
  const { results } = await db.query<DirectUploadRow>(
    "SELECT * FROM direct_uploads WHERE id = ? AND project_id = ?",
    [id, projectId],
  );
  return results[0];
}

export async function claimDirectUpload(
  db: D1Adapter,
  input: {
    id: string;
    projectId: string;
    leaseToken: string;
    now: number;
    leaseExpiresAt: number;
  },
): Promise<boolean> {
  const result = await db.query(
    `UPDATE direct_uploads
     SET status = 'completing', lease_token = ?, lease_expires_at = ?
     WHERE id = ? AND project_id = ? AND purge_after > ?
       AND (status = 'pending' OR (status = 'completing' AND lease_expires_at <= ?))`,
    [
      input.leaseToken,
      input.leaseExpiresAt,
      input.id,
      input.projectId,
      input.now,
      input.now,
    ],
  );
  return changesOf(result.meta) > 0;
}

export async function abortPendingDirectUpload(
  db: D1Adapter,
  id: string,
  projectId: string,
): Promise<boolean> {
  const result = await db.query(
    `UPDATE direct_uploads SET status = 'aborted'
     WHERE id = ? AND project_id = ? AND status = 'pending'`,
    [id, projectId],
  );
  return changesOf(result.meta) > 0;
}

export async function abortCompletingWithLease(
  db: D1Adapter,
  id: string,
  leaseToken: string,
): Promise<void> {
  await db.query(
    `UPDATE direct_uploads
     SET status = 'aborted', lease_token = NULL, lease_expires_at = NULL
     WHERE id = ? AND lease_token = ? AND status = 'completing'`,
    [id, leaseToken],
  );
}

export async function renewDirectUploadLease(
  db: D1Adapter,
  input: {
    id: string;
    leaseToken: string;
    now: number;
    leaseExpiresAt: number;
  },
): Promise<boolean> {
  const result = await db.query(
    `UPDATE direct_uploads SET lease_expires_at = ?
     WHERE id = ? AND lease_token = ? AND status = 'completing'
       AND lease_expires_at > ? AND purge_after > ?`,
    [input.leaseExpiresAt, input.id, input.leaseToken, input.now, input.now],
  );
  return changesOf(result.meta) > 0;
}

export async function completeDirectUpload(
  db: D1Adapter,
  input: {
    id: string;
    leaseToken: string;
    backupId: string;
    now: number;
  },
): Promise<boolean> {
  const result = await db.query(
    `UPDATE direct_uploads
     SET status = 'completed', backup_id = ?, completed_at = ?,
         lease_token = NULL, lease_expires_at = NULL
     WHERE id = ? AND lease_token = ? AND status = 'completing'
       AND lease_expires_at > ?`,
    [input.backupId, input.now, input.id, input.leaseToken, input.now],
  );
  return changesOf(result.meta) > 0;
}

export async function attachCompletedBackup(
  db: D1Adapter,
  input: { id: string; backupId: string; now: number },
): Promise<void> {
  await db.query(
    `UPDATE direct_uploads
     SET status = 'completed', backup_id = ?, completed_at = COALESCE(completed_at, ?),
         lease_token = NULL, lease_expires_at = NULL
     WHERE id = ?`,
    [input.backupId, input.now, input.id],
  );
}

export async function listGcBatch(
  db: D1Adapter,
  now: number,
  limit: number,
): Promise<DirectUploadRow[]> {
  const { results } = await db.query<DirectUploadRow>(
    `SELECT * FROM direct_uploads
     WHERE purged_at IS NULL AND next_gc_at <= ?
     ORDER BY next_gc_at ASC
     LIMIT ?`,
    [now, limit],
  );
  return results;
}

export async function updateDirectUploadGc(
  db: D1Adapter,
  input: {
    id: string;
    nextGcAt: number;
    status?: DirectUploadStatus;
    purgedAt?: number | null;
    backupId?: string | null;
  },
): Promise<void> {
  const sets = ["next_gc_at = ?"];
  const params: unknown[] = [input.nextGcAt];
  if (input.status !== undefined) {
    sets.push("status = ?");
    params.push(input.status);
  }
  if (input.purgedAt !== undefined) {
    sets.push("purged_at = ?");
    params.push(input.purgedAt);
  }
  if (input.backupId !== undefined) {
    sets.push("backup_id = ?");
    params.push(input.backupId);
  }
  params.push(input.id);
  await db.query(
    `UPDATE direct_uploads SET ${sets.join(", ")} WHERE id = ?`,
    params,
  );
}

export async function deleteArchivedDirectUploads(
  db: D1Adapter,
  cutoff: number,
): Promise<void> {
  await db.query("DELETE FROM direct_uploads WHERE purged_at < ?", [cutoff]);
}
