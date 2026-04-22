/**
 * Backup file type detection and classification.
 *
 * Pure functions with zero I/O dependencies — determines file type
 * from filename extension and Content-Type header.
 */

/** Supported backup file types. */
export type FileType = "json" | "zip" | "gz" | "tgz" | "unknown";

/** Content types that map to a known file type. */
const CONTENT_TYPE_MAP: Record<string, FileType> = {
  "application/json": "json",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
  "application/gzip": "gz",
  "application/x-gzip": "gz",
};

/**
 * Detect the file type from a filename and Content-Type header.
 *
 * Priority: extension first (more reliable), then Content-Type as fallback.
 * The Content-Type is stripped of charset parameters before matching.
 */
export function detectFileType(fileName: string, contentType: string): FileType {
  const name = fileName.toLowerCase();

  // Extension-based detection (highest priority)
  if (name.endsWith(".tar.gz") || name.endsWith(".tgz")) return "tgz";
  if (name.endsWith(".json")) return "json";
  if (name.endsWith(".zip")) return "zip";
  if (name.endsWith(".gz")) return "gz";

  // Content-Type fallback (strip charset params like ";charset=utf-8")
  const normalized = (contentType.split(";")[0] ?? "").trim().toLowerCase();
  return CONTENT_TYPE_MAP[normalized] ?? "unknown";
}

/**
 * Get the file extension to use when storing a backup in R2.
 *
 * For known types, uses the canonical extension.
 * For unknown types, preserves the original file extension.
 */
export function getStorageExtension(fileType: FileType, fileName: string): string {
  switch (fileType) {
    case "json": return ".json";
    case "zip": return ".zip";
    case "gz": return ".gz";
    case "tgz": return ".tar.gz";
    case "unknown": {
      const lastDot = fileName.lastIndexOf(".");
      return lastDot > 0 ? fileName.slice(lastDot) : "";
    }
  }
}

/**
 * Whether the file type can be directly previewed without extraction.
 * Currently only JSON files are directly previewable.
 */
export function isPreviewable(fileType: FileType): boolean {
  return fileType === "json";
}

/**
 * Whether the file type can be extracted to find JSON content inside.
 * ZIP, GZ, and TGZ archives may contain JSON files.
 */
export function isExtractable(fileType: FileType): boolean {
  return fileType === "zip" || fileType === "gz" || fileType === "tgz";
}

/**
 * Normalize a raw Content-Type header by stripping charset parameters.
 */
export function normalizeContentType(rawType: string): string {
  return (rawType.split(";")[0] ?? "").trim().toLowerCase();
}
