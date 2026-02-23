import { NextResponse } from "next/server";
import { getProjectByToken } from "@/lib/db/projects";
import { createBackup } from "@/lib/db/backups";
import { uploadToR2 } from "@/lib/r2/client";

/** Max upload size: 50 MB */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/json",
  "application/octet-stream",
]);

/**
 * POST /api/webhook/[projectId] — Receive a backup from an AI agent.
 *
 * Authentication: Bearer token in Authorization header.
 * Body: multipart/form-data with:
 *   - file: the backup file (.zip or .json)
 *   - environment: "dev" | "prod" (optional)
 *   - tag: descriptive label (optional)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;

    // --- Auth ---
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid Authorization header" },
        { status: 401 },
      );
    }

    const token = authHeader.slice(7);
    const project = await getProjectByToken(token);

    if (!project || project.id !== projectId) {
      return NextResponse.json(
        { error: "Invalid token or project mismatch" },
        { status: 403 },
      );
    }

    // --- Parse multipart form ---
    const formData = await request.formData();
    const file = formData.get("file");

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

    // Determine content type from file (strip charset params like ";charset=utf-8")
    const rawType = file.type || "application/octet-stream";
    const contentType = rawType.split(";")[0]!.trim();
    if (!ALLOWED_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${contentType}. Allowed: .zip, .json` },
        { status: 400 },
      );
    }

    const environment = formData.get("environment") as string | null;
    const tag = formData.get("tag") as string | null;

    // Validate environment if provided
    if (environment && !["dev", "prod", "staging", "test"].includes(environment)) {
      return NextResponse.json(
        { error: "Invalid environment. Allowed: dev, prod, staging, test" },
        { status: 400 },
      );
    }

    // --- Determine if single JSON file ---
    const fileName = file.name || "backup";
    const isJson = contentType === "application/json" || fileName.endsWith(".json");

    // --- Upload to R2 ---
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const ext = isJson ? "json" : "zip";
    const fileKey = `backups/${projectId}/${timestamp}.${ext}`;

    const buffer = new Uint8Array(await file.arrayBuffer());
    await uploadToR2(fileKey, buffer, contentType);

    // If it's a JSON file, also store a copy with .json key for preview
    let jsonKey: string | undefined;
    if (isJson) {
      jsonKey = `previews/${projectId}/${timestamp}.json`;
      await uploadToR2(jsonKey, buffer, "application/json");
    }

    // --- Extract sender IP ---
    const forwarded = request.headers.get("x-forwarded-for");
    const senderIp = forwarded?.split(",")[0]?.trim() ?? "unknown";

    // --- Save metadata to D1 ---
    const backup = await createBackup({
      projectId,
      environment: environment ?? undefined,
      senderIp,
      tag: tag ?? undefined,
      fileKey,
      jsonKey,
      fileSize: file.size,
      isSingleJson: isJson,
      jsonExtracted: false,
    });

    return NextResponse.json(
      {
        id: backup.id,
        project_id: backup.project_id,
        file_size: backup.file_size,
        created_at: backup.created_at,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
