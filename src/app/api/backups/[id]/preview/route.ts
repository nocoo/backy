import { NextResponse } from "next/server";
import { getBackup } from "@/lib/db/backups";
import { downloadFromR2 } from "@/lib/r2/client";

/** Max preview size: 5 MB (larger files should be downloaded instead). */
const MAX_PREVIEW_SIZE = 5 * 1024 * 1024;

/**
 * GET /api/backups/[id]/preview — Get JSON content for preview rendering.
 *
 * Returns the parsed JSON content from the backup's json_key.
 * For single JSON uploads, this is the original file.
 * For zip backups, the JSON must be extracted first via POST /extract.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const backup = await getBackup(id);

    if (!backup) {
      return NextResponse.json({ error: "Backup not found" }, { status: 404 });
    }

    if (!backup.json_key) {
      return NextResponse.json(
        {
          error: "No JSON available for preview. Extract JSON first via POST /api/backups/[id]/extract",
          extractable: !backup.is_single_json,
        },
        { status: 404 },
      );
    }

    // Download JSON from R2
    const r2Response = await downloadFromR2(backup.json_key);
    if (!r2Response.body) {
      return NextResponse.json(
        { error: "Failed to download preview file from storage" },
        { status: 500 },
      );
    }

    // Read the stream into a buffer
    const chunks: Uint8Array[] = [];
    const reader = (r2Response.body as ReadableStream<Uint8Array>).getReader();
    let done = false;
    let totalSize = 0;
    while (!done) {
      const result = await reader.read();
      done = result.done;
      if (result.value) {
        totalSize += result.value.byteLength;
        if (totalSize > MAX_PREVIEW_SIZE) {
          return NextResponse.json(
            { error: "JSON file too large for inline preview. Use the download endpoint instead." },
            { status: 413 },
          );
        }
        chunks.push(result.value);
      }
    }

    const text = new TextDecoder().decode(Buffer.concat(chunks));

    // Parse and re-serialize to validate
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "Stored preview file is not valid JSON" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      backup_id: backup.id,
      project_id: backup.project_id,
      project_name: backup.project_name,
      json_key: backup.json_key,
      content: parsed,
    });
  } catch (error) {
    console.error("Failed to load preview:", error);
    return NextResponse.json(
      { error: "Failed to load preview" },
      { status: 500 },
    );
  }
}
