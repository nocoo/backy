import type { FileType } from "./backup/file-type";
import { getStorageExtension } from "./backup/file-type";

export const MAX_DIRECT_BYTES = 5_000_000_000;
export const PUT_TTL_SECONDS = 3600;
export const PURGE_GRACE_SECONDS = 3600;
export const REAP_GRACE_SECONDS = 3600;
export const LEASE_TTL_SECONDS = 900;
export const MAX_KEY_BYTES = 1024;
export const MAX_FILE_NAME = 255;
export const MAX_PREVIEW_SIZE = 5 * 1024 * 1024;
export const GC_BATCH_SIZE = 100;
export const GC_BUDGET_MS = 10_000;
export const ARCHIVE_AFTER_SECONDS = 7 * 24 * 3600;

export const VALID_ENVIRONMENTS = ["dev", "prod", "staging", "test"] as const;

export const QUOTA_PROJECT_WRITABLE_ROWS = 20;
export const QUOTA_PROJECT_WRITABLE_BYTES = 20 * 1024 * 1024 * 1024;
export const QUOTA_PROJECT_INITS_PER_60S = 30;
export const QUOTA_GLOBAL_WRITABLE_ROWS = 200;
export const QUOTA_PROJECT_HOURLY_BYTES = 20 * 1024 * 1024 * 1024;
export const QUOTA_GLOBAL_HOURLY_BYTES = 100 * 1024 * 1024 * 1024;
export const QUOTA_PROJECT_DAILY_BYTES = 100 * 1024 * 1024 * 1024;
export const QUOTA_GLOBAL_DAILY_BYTES = 500 * 1024 * 1024 * 1024;

export const WRITABLE_STATUS_SQL =
  "status IN ('pending','completing','aborted','expired')";

export function unixNow(ms = Date.now()): number {
  return Math.floor(ms / 1000);
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function directExtension(fileType: FileType, fileName: string): string {
  if (fileType === "unknown") return ".bin";
  return getStorageExtension(fileType, fileName);
}

export function generateDirectStagingKey(
  projectId: string,
  uploadId: string,
  ext: string,
): string {
  return `direct-staging/${projectId}/${uploadId}/in${ext}`;
}

export function generateDirectFinalKey(
  projectId: string,
  uploadId: string,
  ext: string,
): string {
  return `backups/${projectId}/direct/${uploadId}${ext}`;
}

export function isDirectFinalKey(key: string): boolean {
  return /^backups\/[^/]+\/direct\//.test(key);
}

export function validateFileName(name: unknown): string | null {
  if (typeof name !== "string" || name.length === 0 || name.length > MAX_FILE_NAME) {
    return "file_name is required (max 255 characters)";
  }
  if (
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("\0") ||
    name.includes("..")
  ) {
    return "file_name must be a basename";
  }
  return null;
}
