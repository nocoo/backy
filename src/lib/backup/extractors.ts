/**
 * Backup extraction strategies.
 *
 * Given a raw file buffer and its FileType, attempts to extract JSON content.
 * Uses the Strategy pattern so each archive format has an isolated handler.
 *
 * Security: All decompression is size-limited to prevent decompression bomb
 * DoS attacks. Streaming gunzip aborts early when the decompressed output
 * exceeds MAX_DECOMPRESSED_SIZE. ZIP entries are checked via metadata before
 * decompression. Tar entries are size-checked during streaming.
 *
 * Dependencies:
 *  - jszip (existing) for ZIP files
 *  - node:zlib (built-in) for gzip decompression
 *  - tar-stream for tar archive parsing
 */

import type { FileType } from "./file-type";
import JSZip from "jszip";
import { createGunzip } from "node:zlib";
import tar from "tar-stream";

/** Max extracted JSON size: 10 MB */
const MAX_JSON_SIZE = 10 * 1024 * 1024;

/** Max decompressed archive size: 50 MB (decompression bomb defense) */
export const MAX_DECOMPRESSED_SIZE = 50 * 1024 * 1024;

/** Successful extraction result. */
export interface ExtractSuccess {
  success: true;
  /** The raw JSON content as bytes. */
  jsonContent: Uint8Array;
  /** Name of the source file (e.g. entry name inside archive). */
  sourceFile: string;
  /** Number of JSON files found (meaningful for ZIP/TGZ). */
  jsonFilesFound: number;
}

/** Failed extraction result. */
export interface ExtractFailure {
  success: false;
  /** Human-readable explanation of why extraction failed. */
  reason: string;
}

export type ExtractOutcome = ExtractSuccess | ExtractFailure;

// ---------------------------------------------------------------------------
// Internal: size-limited gunzip
// ---------------------------------------------------------------------------

/**
 * Streaming gunzip with early abort when output exceeds maxBytes.
 * Prevents decompression bombs from exhausting server memory.
 */
function gunzipWithLimit(input: Buffer, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const gunzip = createGunzip();
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let destroyed = false;

    gunzip.on("data", (chunk: Buffer) => {
      if (destroyed) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        destroyed = true;
        gunzip.destroy();
        reject(
          new Error(
            `Decompressed output exceeds ${(maxBytes / 1024 / 1024).toFixed(0)}MB limit (possible decompression bomb)`,
          ),
        );
        return;
      }
      chunks.push(chunk);
    });

    gunzip.on("end", () => {
      if (!destroyed) resolve(Buffer.concat(chunks));
    });

    gunzip.on("error", (err) => {
      if (!destroyed) reject(err);
    });

    gunzip.end(input);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract JSON content from a backup file buffer.
 *
 * Dispatches to the correct strategy based on file type.
 * Returns a discriminated union so callers can pattern-match on `success`.
 */
export async function extractJson(
  buffer: Uint8Array,
  fileType: FileType,
): Promise<ExtractOutcome> {
  switch (fileType) {
    case "zip": return extractFromZip(buffer);
    case "gz": return extractFromGz(buffer);
    case "tgz": return extractFromTgz(buffer);
    case "json":
      return { success: false, reason: "File is already JSON, no extraction needed" };
    case "unknown":
      return { success: false, reason: "Unsupported file format — cannot extract preview content" };
  }
}

// ---------------------------------------------------------------------------
// Strategy: ZIP
// ---------------------------------------------------------------------------

/**
 * Extract the first .json file from a ZIP archive.
 * Sorted alphabetically for deterministic selection.
 *
 * Checks entry metadata (uncompressed size) before decompression to
 * reject obviously oversized entries without decompressing.
 */
export async function extractFromZip(buffer: Uint8Array): Promise<ExtractOutcome> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return { success: false, reason: "Failed to parse ZIP archive — file may be corrupt" };
  }

  const jsonFiles = Object.keys(zip.files)
    .filter((name) => name.endsWith(".json") && !zip.files[name]?.dir)
    .sort();

  if (jsonFiles.length === 0) {
    return { success: false, reason: "No JSON files found in the ZIP archive" };
  }

  const jsonFileName = jsonFiles[0];
  const zipEntry = jsonFileName ? zip.files[jsonFileName] : undefined;
  if (!jsonFileName || !zipEntry) {
    return { success: false, reason: "No JSON files found in the ZIP archive" };
  }

  // Check metadata-declared uncompressed size before decompressing (decompression bomb defense)
  const declaredSize = (zipEntry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
  if (declaredSize !== undefined && declaredSize > MAX_DECOMPRESSED_SIZE) {
    return {
      success: false,
      reason: `JSON file uncompressed size (${(declaredSize / 1024 / 1024).toFixed(1)}MB) exceeds ${MAX_DECOMPRESSED_SIZE / 1024 / 1024}MB limit`,
    };
  }

  const jsonContent = await zipEntry.async("uint8array");

  // Post-decompression size check (catches cases where metadata is missing or inaccurate)
  if (jsonContent.byteLength > MAX_DECOMPRESSED_SIZE) {
    return {
      success: false,
      reason: `Decompressed JSON file exceeds ${MAX_DECOMPRESSED_SIZE / 1024 / 1024}MB limit (possible decompression bomb)`,
    };
  }

  if (jsonContent.byteLength > MAX_JSON_SIZE) {
    return {
      success: false,
      reason: `JSON file too large for preview: ${(jsonContent.byteLength / 1024 / 1024).toFixed(1)}MB (max ${MAX_JSON_SIZE / 1024 / 1024}MB)`,
    };
  }

  // Validate JSON
  try {
    const text = new TextDecoder().decode(jsonContent);
    JSON.parse(text);
  } catch {
    return { success: false, reason: `File "${jsonFileName}" is not valid JSON` };
  }

  return {
    success: true,
    jsonContent,
    sourceFile: jsonFileName,
    jsonFilesFound: jsonFiles.length,
  };
}

// ---------------------------------------------------------------------------
// Strategy: GZ
// ---------------------------------------------------------------------------

/**
 * Decompress a gzip file and check if the content is valid JSON.
 *
 * .gz only compresses a single file, so the entire decompressed output
 * is checked as one unit. Uses streaming gunzip with size limit.
 */
export async function extractFromGz(buffer: Uint8Array): Promise<ExtractOutcome> {
  let decompressed: Buffer;
  try {
    decompressed = await gunzipWithLimit(Buffer.from(buffer), MAX_DECOMPRESSED_SIZE);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("limit")) {
      return { success: false, reason: message };
    }
    return { success: false, reason: "Failed to decompress GZ file — file may be corrupt" };
  }

  if (decompressed.byteLength > MAX_JSON_SIZE) {
    return {
      success: false,
      reason: `Decompressed content too large for preview: ${(decompressed.byteLength / 1024 / 1024).toFixed(1)}MB (max ${MAX_JSON_SIZE / 1024 / 1024}MB)`,
    };
  }

  // Check if decompressed content is valid JSON
  try {
    const text = new TextDecoder().decode(decompressed);
    JSON.parse(text);
  } catch {
    return {
      success: false,
      reason: "Decompressed content is not valid JSON — preview is not available for this file",
    };
  }

  return {
    success: true,
    jsonContent: new Uint8Array(decompressed),
    sourceFile: "decompressed.json",
    jsonFilesFound: 1,
  };
}

// ---------------------------------------------------------------------------
// Strategy: TGZ (tar.gz)
// ---------------------------------------------------------------------------

/**
 * Decompress a .tar.gz, then scan tar entries for the first .json file.
 * Collects all JSON entry names, picks the first alphabetically for determinism.
 *
 * Uses size-limited gunzip for the decompression step. Tar entry parsing
 * also enforces per-entry size limits via header metadata.
 */
export async function extractFromTgz(buffer: Uint8Array): Promise<ExtractOutcome> {
  // Step 1: gunzip with size limit
  let tarBuffer: Buffer;
  try {
    tarBuffer = await gunzipWithLimit(Buffer.from(buffer), MAX_DECOMPRESSED_SIZE);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("limit")) {
      return { success: false, reason: message };
    }
    return { success: false, reason: "Failed to decompress TGZ file — file may be corrupt" };
  }

  // Step 2: parse tar entries and collect all .json files
  const jsonEntries: Array<{ name: string; content: Buffer }> = [];

  try {
    await parseTarEntries(tarBuffer, (name, content) => {
      if (name.endsWith(".json")) {
        jsonEntries.push({ name, content });
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("limit")) {
      return { success: false, reason: message };
    }
    return { success: false, reason: "Failed to parse TAR archive — file may be corrupt" };
  }

  if (jsonEntries.length === 0) {
    return { success: false, reason: "No JSON files found in the TAR.GZ archive" };
  }

  // Sort alphabetically and pick the first
  jsonEntries.sort((a, b) => a.name.localeCompare(b.name));
  const entry = jsonEntries[0];
  if (!entry) {
    return { success: false, reason: "No JSON files found in the TAR.GZ archive" };
  }

  if (entry.content.byteLength > MAX_JSON_SIZE) {
    return {
      success: false,
      reason: `JSON file too large for preview: ${(entry.content.byteLength / 1024 / 1024).toFixed(1)}MB (max ${MAX_JSON_SIZE / 1024 / 1024}MB)`,
    };
  }

  // Validate JSON
  try {
    const text = new TextDecoder().decode(entry.content);
    JSON.parse(text);
  } catch {
    return { success: false, reason: `File "${entry.name}" is not valid JSON` };
  }

  return {
    success: true,
    jsonContent: new Uint8Array(entry.content),
    sourceFile: entry.name,
    jsonFilesFound: jsonEntries.length,
  };
}

// ---------------------------------------------------------------------------
// Internal: tar stream helper
// ---------------------------------------------------------------------------

/**
 * Parse a tar buffer and invoke a callback for each file entry.
 * Skips directories and other non-file entries.
 *
 * Enforces per-entry size limit via header.size metadata to prevent
 * individual oversized entries from exhausting memory.
 */
function parseTarEntries(
  tarBuffer: Buffer,
  onEntry: (name: string, content: Buffer) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const extract = tar.extract();
    let rejected = false;

    extract.on("entry", (header, stream, next) => {
      if (header.type !== "file") {
        stream.resume();
        next();
        return;
      }

      // Check declared entry size before reading (decompression bomb defense)
      if (header.size != null && header.size > MAX_DECOMPRESSED_SIZE) {
        rejected = true;
        stream.destroy();
        extract.destroy();
        reject(
          new Error(
            `Tar entry "${header.name}" size (${(header.size / 1024 / 1024).toFixed(1)}MB) exceeds ${MAX_DECOMPRESSED_SIZE / 1024 / 1024}MB limit`,
          ),
        );
        return;
      }

      const chunks: Buffer[] = [];
      let entryBytes = 0;

      stream.on("data", (chunk: Buffer) => {
        if (rejected) return;
        entryBytes += chunk.length;
        if (entryBytes > MAX_DECOMPRESSED_SIZE) {
          rejected = true;
          stream.destroy();
          extract.destroy();
          reject(
            new Error(
              `Tar entry "${header.name}" exceeds ${MAX_DECOMPRESSED_SIZE / 1024 / 1024}MB limit during read`,
            ),
          );
          return;
        }
        chunks.push(chunk);
      });

      stream.on("end", () => {
        if (!rejected) {
          onEntry(header.name, Buffer.concat(chunks));
          next();
        }
      });
      stream.on("error", (err) => {
        if (!rejected) reject(err);
      });
    });

    extract.on("finish", () => {
      if (!rejected) resolve();
    });
    extract.on("error", (err) => {
      if (!rejected) reject(err);
    });

    // Feed the tar buffer into the extract stream
    extract.end(tarBuffer);
  });
}
