import { NextResponse } from "next/server";
import JSZip from "jszip";
import { createBackup } from "@/lib/db/backups";
import { getProject } from "@/lib/db/projects";
import { uploadToR2 } from "@/lib/r2/client";
import { detectFileType, isPreviewable, normalizeContentType } from "@/lib/backup/file-type";
import { generateBackupKey, generatePreviewKey, generateTimestamp } from "@/lib/backup/storage";

/** Max upload size: 50 MB */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * POST /api/backups/upload — Manual backup upload from the UI.
 *
 * Body: multipart/form-data with:
 *   - file: the backup file (any format accepted)
 *   - projectId: target project ID
 *   - tag: descriptive label (optional)
 *   - environment: "dev" | "prod" | "staging" | "test" (optional)
 *
 * JSON files are auto-compressed into ZIP and a preview copy is stored.
 * All other formats (zip, gz, tgz, unknown) are stored as-is.
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const projectId = formData.get("projectId") as string | null;
    const tag = formData.get("tag") as string | null;
    const environment = formData.get("environment") as string | null;

    // Validate project
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 },
      );
    }

    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 },
      );
    }

    // Validate file
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing 'file' field in form data" },
        { status: 400 },
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: "File is empty" },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum: ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 413 },
      );
    }

    // Validate environment
    if (environment && !["dev", "prod", "staging", "test"].includes(environment)) {
      return NextResponse.json(
        { error: "Invalid environment. Allowed: dev, prod, staging, test" },
        { status: 400 },
      );
    }

    // Detect file type using module
    const fileName = file.name || "backup";
    const rawType = file.type || "application/octet-stream";
    const contentType = normalizeContentType(rawType);
    const fileType = detectFileType(fileName, contentType);

    const timestamp = generateTimestamp();
    const buffer = new Uint8Array(await file.arrayBuffer());
    let fileKey: string;
    let jsonKey: string | undefined;
    let fileSize: number;
    const isSingleJson = isPreviewable(fileType);

    if (isSingleJson) {
      // JSON: auto-compress into ZIP for storage, keep raw JSON for preview
      const zip = new JSZip();
      zip.file(fileName, buffer);
      const zipBuffer = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

      fileKey = `backups/${projectId}/${timestamp}.zip`;
      await uploadToR2(fileKey, zipBuffer, "application/zip");
      fileSize = zipBuffer.length;

      jsonKey = generatePreviewKey(projectId, timestamp);
      await uploadToR2(jsonKey, buffer, "application/json");
    } else {
      // All other types (zip, gz, tgz, unknown): store as-is
      fileKey = generateBackupKey(projectId, fileType, fileName, timestamp);
      await uploadToR2(fileKey, buffer, contentType);
      fileSize = buffer.length;
    }

    // Save metadata to D1
    const backup = await createBackup({
      projectId,
      environment: environment ?? undefined,
      senderIp: "manual-upload",
      tag: tag ?? undefined,
      fileKey,
      jsonKey,
      fileSize,
      isSingleJson,
      jsonExtracted: false,
      fileType,
    });

    return NextResponse.json(
      {
        id: backup.id,
        project_id: backup.project_id,
        file_size: fileSize,
        created_at: backup.created_at,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Manual upload error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
