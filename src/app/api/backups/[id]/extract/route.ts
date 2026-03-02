import { NextResponse } from "next/server";
import { getBackup, updateBackup } from "@/lib/db/backups";
import { downloadFromR2, uploadToR2 } from "@/lib/r2/client";
import { extractJson } from "@/lib/backup/extractors";
import { isExtractable } from "@/lib/backup/file-type";
import type { FileType } from "@/lib/backup/file-type";
import { generatePreviewKey } from "@/lib/backup/storage";

/**
 * POST /api/backups/[id]/extract — Extract JSON from a backup archive.
 *
 * Supports ZIP, GZ, and TGZ formats. Extracts the first JSON file found,
 * stores it in R2 under the previews/ prefix, and updates the backup record.
 * Returns an error for unknown/non-extractable formats.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const backup = await getBackup(id);

    if (!backup) {
      return NextResponse.json({ error: "Backup not found" }, { status: 404 });
    }

    // Already has JSON available (single JSON upload or previously extracted)
    if (backup.json_key) {
      return NextResponse.json({
        message: "JSON already available",
        json_key: backup.json_key,
      });
    }

    // JSON files don't need extraction
    if (backup.is_single_json) {
      return NextResponse.json(
        { error: "Backup is already a JSON file, no extraction needed" },
        { status: 400 },
      );
    }

    // Check if the file type supports extraction
    const fileType = (backup.file_type || "unknown") as FileType;
    if (!isExtractable(fileType)) {
      return NextResponse.json(
        { error: "Preview is not available for this file format" },
        { status: 400 },
      );
    }

    // Download the archive from R2
    const r2Response = await downloadFromR2(backup.file_key);
    if (!r2Response.body) {
      return NextResponse.json(
        { error: "Failed to download backup file from storage" },
        { status: 500 },
      );
    }

    // Read the body into a buffer using SDK's transformToByteArray
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const archiveBuffer = await (r2Response.body as any).transformToByteArray();

    // Extract JSON using the strategy module
    const outcome = await extractJson(new Uint8Array(archiveBuffer), fileType);

    if (!outcome.success) {
      return NextResponse.json(
        { error: outcome.reason },
        { status: 400 },
      );
    }

    // Upload extracted JSON to R2 under previews/ prefix
    const jsonKey = generatePreviewKey(backup.project_id);
    await uploadToR2(jsonKey, outcome.jsonContent, "application/json");

    // Update backup record
    await updateBackup(id, {
      jsonKey,
      jsonExtracted: true,
    });

    return NextResponse.json({
      message: "JSON extracted successfully",
      json_key: jsonKey,
      source_file: outcome.sourceFile,
      json_files_found: outcome.jsonFilesFound,
    });
  } catch (error) {
    console.error("Failed to extract JSON:", error);
    return NextResponse.json(
      { error: "Failed to extract JSON from backup" },
      { status: 500 },
    );
  }
}
