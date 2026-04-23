/**
 * Backup storage key generation for R2.
 *
 * Pure functions that generate deterministic R2 object keys
 * for backup files and JSON preview files.
 */

import type { FileType } from "./file-type";
import { getStorageExtension } from "./file-type";

/**
 * Generate a consistent ISO-based timestamp string for R2 keys.
 * Replaces colons and dots with dashes for filesystem/URL safety.
 *
 * @example "2026-03-02T10-30-00-000Z"
 */
export function generateTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

/**
 * Generate the R2 object key for storing a backup file.
 *
 * @param projectId - The project this backup belongs to
 * @param fileType  - Detected file type
 * @param fileName  - Original file name (used for unknown type extension)
 * @param timestamp - Optional pre-generated timestamp (for deterministic tests)
 *
 * @example "backups/proj123/2026-03-02T10-30-00-000Z.json"
 * @example "backups/proj123/2026-03-02T10-30-00-000Z.tar.gz"
 * @example "backups/proj123/2026-03-02T10-30-00-000Z.sql" (unknown type)
 */
export function generateBackupKey(
  projectId: string,
  fileType: FileType,
  fileName: string,
  timestamp?: string,
): string {
  const ts = timestamp ?? generateTimestamp();
  const ext = getStorageExtension(fileType, fileName);
  return `backups/${projectId}/${ts}${ext}`;
}

/**
 * Generate the R2 object key for storing a JSON preview file.
 *
 * @param projectId - The project this backup belongs to
 * @param timestamp - Optional pre-generated timestamp (for deterministic tests)
 *
 * @example "previews/proj123/2026-03-02T10-30-00-000Z.json"
 */
export function generatePreviewKey(
  projectId: string,
  timestamp?: string,
): string {
  const ts = timestamp ?? generateTimestamp();
  return `previews/${projectId}/${ts}.json`;
}
