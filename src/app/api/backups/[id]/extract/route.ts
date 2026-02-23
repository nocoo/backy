import { NextResponse } from "next/server";
import { getBackup, updateBackup } from "@/lib/db/backups";
import { downloadFromR2, uploadToR2 } from "@/lib/r2/client";
import JSZip from "jszip";

/** Max extracted JSON size: 10 MB */
const MAX_JSON_SIZE = 10 * 1024 * 1024;

/**
 * POST /api/backups/[id]/extract — Extract JSON from a zip backup.
 *
 * Finds the first .json file inside the zip, extracts it, stores it in R2
 * under the previews/ prefix, and updates the backup record with the json_key.
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

    // Only zip files need extraction
    if (backup.is_single_json) {
      return NextResponse.json(
        { error: "Backup is already a JSON file, no extraction needed" },
        { status: 400 },
      );
    }

    // Download the zip from R2
    const r2Response = await downloadFromR2(backup.file_key);
    if (!r2Response.body) {
      return NextResponse.json(
        { error: "Failed to download backup file from storage" },
        { status: 500 },
      );
    }

    // Read the stream into a buffer
    const chunks: Uint8Array[] = [];
    const reader = (r2Response.body as ReadableStream<Uint8Array>).getReader();
    let done = false;
    while (!done) {
      const result = await reader.read();
      done = result.done;
      if (result.value) chunks.push(result.value);
    }
    const zipBuffer = Buffer.concat(chunks);

    // Parse the zip
    const zip = await JSZip.loadAsync(zipBuffer);

    // Find the first .json file (sorted alphabetically for determinism)
    const jsonFiles = Object.keys(zip.files)
      .filter((name) => name.endsWith(".json") && !zip.files[name]!.dir)
      .sort();

    if (jsonFiles.length === 0) {
      return NextResponse.json(
        { error: "No JSON files found in the zip archive" },
        { status: 400 },
      );
    }

    // Extract the first JSON file
    const jsonFileName = jsonFiles[0]!;
    const jsonContent = await zip.files[jsonFileName]!.async("uint8array");

    if (jsonContent.byteLength > MAX_JSON_SIZE) {
      return NextResponse.json(
        {
          error: `JSON file too large for preview: ${(jsonContent.byteLength / 1024 / 1024).toFixed(1)}MB (max ${MAX_JSON_SIZE / 1024 / 1024}MB)`,
        },
        { status: 413 },
      );
    }

    // Validate that it's actually valid JSON
    try {
      const text = new TextDecoder().decode(jsonContent);
      JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: `File "${jsonFileName}" is not valid JSON` },
        { status: 400 },
      );
    }

    // Upload extracted JSON to R2 under previews/ prefix
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const jsonKey = `previews/${backup.project_id}/${timestamp}.json`;
    await uploadToR2(jsonKey, jsonContent, "application/json");

    // Update backup record
    await updateBackup(id, {
      jsonKey,
      jsonExtracted: true,
    });

    return NextResponse.json({
      message: "JSON extracted successfully",
      json_key: jsonKey,
      source_file: jsonFileName,
      json_files_found: jsonFiles.length,
    });
  } catch (error) {
    console.error("Failed to extract JSON:", error);
    return NextResponse.json(
      { error: "Failed to extract JSON from backup" },
      { status: 500 },
    );
  }
}
