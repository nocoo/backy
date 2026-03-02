/**
 * Backup extraction strategies.
 *
 * Given a raw file buffer and its FileType, attempts to extract JSON content.
 * Uses the Strategy pattern so each archive format has an isolated handler.
 *
 * Dependencies:
 *  - jszip (existing) for ZIP files
 *  - node:zlib (built-in) for gzip decompression
 *  - tar-stream for tar archive parsing
 */

import type { FileType } from "./file-type";
import JSZip from "jszip";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import tar from "tar-stream";

const gunzipAsync = promisify(gunzip);

/** Max extracted JSON size: 10 MB */
const MAX_JSON_SIZE = 10 * 1024 * 1024;

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
 */
export async function extractFromZip(buffer: Uint8Array): Promise<ExtractOutcome> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return { success: false, reason: "Failed to parse ZIP archive — file may be corrupt" };
  }

  const jsonFiles = Object.keys(zip.files)
    .filter((name) => name.endsWith(".json") && !zip.files[name]!.dir)
    .sort();

  if (jsonFiles.length === 0) {
    return { success: false, reason: "No JSON files found in the ZIP archive" };
  }

  const jsonFileName = jsonFiles[0]!;
  const jsonContent = await zip.files[jsonFileName]!.async("uint8array");

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
 * is checked as one unit.
 */
export async function extractFromGz(buffer: Uint8Array): Promise<ExtractOutcome> {
  let decompressed: Buffer;
  try {
    decompressed = await gunzipAsync(Buffer.from(buffer));
  } catch {
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
 */
export async function extractFromTgz(buffer: Uint8Array): Promise<ExtractOutcome> {
  // Step 1: gunzip
  let tarBuffer: Buffer;
  try {
    tarBuffer = await gunzipAsync(Buffer.from(buffer));
  } catch {
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
  } catch {
    return { success: false, reason: "Failed to parse TAR archive — file may be corrupt" };
  }

  if (jsonEntries.length === 0) {
    return { success: false, reason: "No JSON files found in the TAR.GZ archive" };
  }

  // Sort alphabetically and pick the first
  jsonEntries.sort((a, b) => a.name.localeCompare(b.name));
  const entry = jsonEntries[0]!;

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
 */
function parseTarEntries(
  tarBuffer: Buffer,
  onEntry: (name: string, content: Buffer) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const extract = tar.extract();

    extract.on("entry", (header, stream, next) => {
      if (header.type !== "file") {
        stream.resume();
        next();
        return;
      }

      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => {
        onEntry(header.name, Buffer.concat(chunks));
        next();
      });
      stream.on("error", reject);
    });

    extract.on("finish", resolve);
    extract.on("error", reject);

    // Feed the tar buffer into the extract stream
    extract.end(tarBuffer);
  });
}
