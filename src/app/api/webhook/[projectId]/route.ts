import { NextResponse } from "next/server";
import { getProjectByToken } from "@/lib/db/projects";
import { createBackup, listBackups, countBackups } from "@/lib/db/backups";
import { uploadToR2 } from "@/lib/r2/client";
import { enforceIpRestriction, getClientIp } from "@/lib/ip";
import {
  createWebhookLog,
  type WebhookErrorCode,
} from "@/lib/db/webhook-logs";

/** Max upload size: 50 MB */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/json",
  "application/octet-stream",
]);

/** Extract common request info for logging. */
function extractRequestInfo(request: Request) {
  return {
    clientIp: getClientIp(request),
    userAgent: request.headers.get("user-agent"),
  };
}

/**
 * Fire-and-forget log write. Intentionally not awaited so the response
 * is never delayed by log persistence.
 */
function fireLog(entry: {
  projectId: string | null;
  method: string;
  path: string;
  statusCode: number;
  clientIp: string | null;
  userAgent: string | null;
  errorCode: WebhookErrorCode | null;
  errorMessage: string | null;
  startTime: number;
  metadata: Record<string, unknown> | null;
}) {
  const durationMs = Date.now() - entry.startTime;
  // Intentionally not awaited — fire-and-forget
  void createWebhookLog({
    projectId: entry.projectId,
    method: entry.method,
    path: entry.path,
    statusCode: entry.statusCode,
    clientIp: entry.clientIp,
    userAgent: entry.userAgent,
    errorCode: entry.errorCode,
    errorMessage: entry.errorMessage,
    durationMs,
    metadata: entry.metadata,
  });
}

/**
 * HEAD /api/webhook/[projectId] — Verify API key validity.
 *
 * Senders can use this lightweight check to confirm their API key
 * is correct before attempting a full backup upload. Returns:
 *   - 200: valid token, project matched
 *   - 401: missing or malformed Authorization header
 *   - 403: invalid token or project mismatch
 */
export async function HEAD(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const startTime = Date.now();
  const { clientIp, userAgent } = extractRequestInfo(request);

  try {
    const { projectId } = await params;
    const path = `/api/webhook/${projectId}`;

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      fireLog({
        projectId: null, method: "HEAD", path, statusCode: 401,
        clientIp, userAgent, errorCode: "auth_missing",
        errorMessage: "Missing or malformed Authorization header",
        startTime, metadata: null,
      });
      return new Response(null, { status: 401 });
    }

    const token = authHeader.slice(7);
    const project = await getProjectByToken(token);

    if (!project || project.id !== projectId) {
      fireLog({
        projectId: project?.id ?? null, method: "HEAD", path, statusCode: 403,
        clientIp, userAgent, errorCode: "auth_invalid",
        errorMessage: "Invalid token or project mismatch",
        startTime, metadata: null,
      });
      return new Response(null, { status: 403 });
    }

    // --- IP restriction ---
    const headIpBlock = enforceIpRestriction(request, project.allowed_ips, { headRequest: true });
    if (headIpBlock) {
      fireLog({
        projectId: project.id, method: "HEAD", path, statusCode: 403,
        clientIp, userAgent, errorCode: "ip_blocked",
        errorMessage: "IP not in project allowlist",
        startTime, metadata: { allowed_ips: project.allowed_ips },
      });
      return headIpBlock;
    }

    fireLog({
      projectId: project.id, method: "HEAD", path, statusCode: 200,
      clientIp, userAgent, errorCode: null, errorMessage: null,
      startTime, metadata: null,
    });

    return new Response(null, {
      status: 200,
      headers: { "X-Project-Name": project.name },
    });
  } catch (error) {
    console.error("Webhook HEAD error:", error);
    fireLog({
      projectId: null, method: "HEAD", path: "/api/webhook/unknown",
      statusCode: 500, clientIp, userAgent, errorCode: "internal_error",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      startTime, metadata: null,
    });
    return new Response(null, { status: 500 });
  }
}

/**
 * GET /api/webhook/[projectId] — Query backup status for a project.
 *
 * Authentication: Bearer token in Authorization header.
 * Query params:
 *   - environment: filter by environment (optional)
 *
 * Returns:
 *   - project_name: string
 *   - environment: string | null (filter applied)
 *   - total_backups: number
 *   - recent_backups: last 5 backups with time, tag, environment, size
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const startTime = Date.now();
  const { clientIp, userAgent } = extractRequestInfo(request);

  try {
    const { projectId } = await params;
    const path = `/api/webhook/${projectId}`;

    // --- Auth ---
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      fireLog({
        projectId: null, method: "GET", path, statusCode: 401,
        clientIp, userAgent, errorCode: "auth_missing",
        errorMessage: "Missing or invalid Authorization header",
        startTime, metadata: null,
      });
      return NextResponse.json(
        { error: "Missing or invalid Authorization header" },
        { status: 401 },
      );
    }

    const token = authHeader.slice(7);
    const project = await getProjectByToken(token);

    if (!project || project.id !== projectId) {
      fireLog({
        projectId: project?.id ?? null, method: "GET", path, statusCode: 403,
        clientIp, userAgent, errorCode: "auth_invalid",
        errorMessage: "Invalid token or project mismatch",
        startTime, metadata: null,
      });
      return NextResponse.json(
        { error: "Invalid token or project mismatch" },
        { status: 403 },
      );
    }

    // --- IP restriction ---
    const getIpBlock = enforceIpRestriction(request, project.allowed_ips);
    if (getIpBlock) {
      fireLog({
        projectId: project.id, method: "GET", path, statusCode: 403,
        clientIp, userAgent, errorCode: "ip_blocked",
        errorMessage: "IP not in project allowlist",
        startTime, metadata: { allowed_ips: project.allowed_ips },
      });
      return getIpBlock;
    }

    // --- Parse query params ---
    const url = new URL(request.url);
    const environment = url.searchParams.get("environment") ?? undefined;

    // --- Fetch data ---
    const [total, backups] = await Promise.all([
      countBackups(projectId),
      listBackups({
        projectId,
        environment,
        sortBy: "created_at",
        sortOrder: "desc",
        page: 1,
        pageSize: 5,
      }),
    ]);

    fireLog({
      projectId: project.id, method: "GET", path, statusCode: 200,
      clientIp, userAgent, errorCode: null, errorMessage: null,
      startTime, metadata: { total_backups: total, environment: environment ?? null },
    });

    return NextResponse.json({
      project_name: project.name,
      environment: environment ?? null,
      total_backups: total,
      recent_backups: backups.items.map((b) => ({
        id: b.id,
        tag: b.tag,
        environment: b.environment,
        file_size: b.file_size,
        is_single_json: b.is_single_json,
        created_at: b.created_at,
      })),
    });
  } catch (error) {
    console.error("Webhook GET error:", error);
    fireLog({
      projectId: null, method: "GET", path: "/api/webhook/unknown",
      statusCode: 500, clientIp, userAgent, errorCode: "internal_error",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      startTime, metadata: null,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

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
  const startTime = Date.now();
  const { clientIp, userAgent } = extractRequestInfo(request);

  try {
    const { projectId } = await params;
    const path = `/api/webhook/${projectId}`;

    // --- Auth ---
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      fireLog({
        projectId: null, method: "POST", path, statusCode: 401,
        clientIp, userAgent, errorCode: "auth_missing",
        errorMessage: "Missing or invalid Authorization header",
        startTime, metadata: null,
      });
      return NextResponse.json(
        { error: "Missing or invalid Authorization header" },
        { status: 401 },
      );
    }

    const token = authHeader.slice(7);
    const project = await getProjectByToken(token);

    if (!project || project.id !== projectId) {
      fireLog({
        projectId: project?.id ?? null, method: "POST", path, statusCode: 403,
        clientIp, userAgent, errorCode: "auth_invalid",
        errorMessage: "Invalid token or project mismatch",
        startTime, metadata: null,
      });
      return NextResponse.json(
        { error: "Invalid token or project mismatch" },
        { status: 403 },
      );
    }

    // --- IP restriction ---
    const postIpBlock = enforceIpRestriction(request, project.allowed_ips);
    if (postIpBlock) {
      fireLog({
        projectId: project.id, method: "POST", path, statusCode: 403,
        clientIp, userAgent, errorCode: "ip_blocked",
        errorMessage: "IP not in project allowlist",
        startTime, metadata: { allowed_ips: project.allowed_ips },
      });
      return postIpBlock;
    }

    // --- Parse multipart form ---
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      fireLog({
        projectId: project.id, method: "POST", path, statusCode: 400,
        clientIp, userAgent, errorCode: "file_missing",
        errorMessage: "Missing 'file' field in form data",
        startTime, metadata: null,
      });
      return NextResponse.json(
        { error: "Missing 'file' field in form data" },
        { status: 400 },
      );
    }

    if (file.size === 0) {
      fireLog({
        projectId: project.id, method: "POST", path, statusCode: 400,
        clientIp, userAgent, errorCode: "file_empty",
        errorMessage: "File is empty",
        startTime, metadata: { file_name: file.name },
      });
      return NextResponse.json(
        { error: "File is empty" },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      fireLog({
        projectId: project.id, method: "POST", path, statusCode: 413,
        clientIp, userAgent, errorCode: "file_too_large",
        errorMessage: `File too large: ${file.size} bytes (max ${MAX_FILE_SIZE})`,
        startTime, metadata: { file_size: file.size, file_name: file.name },
      });
      return NextResponse.json(
        { error: `File too large. Maximum: ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 413 },
      );
    }

    // Determine content type from file (strip charset params like ";charset=utf-8")
    const rawType = file.type || "application/octet-stream";
    const contentType = rawType.split(";")[0]!.trim();
    if (!ALLOWED_TYPES.has(contentType)) {
      fireLog({
        projectId: project.id, method: "POST", path, statusCode: 400,
        clientIp, userAgent, errorCode: "file_type_invalid",
        errorMessage: `Unsupported file type: ${contentType}`,
        startTime, metadata: { content_type: contentType, file_name: file.name },
      });
      return NextResponse.json(
        { error: `Unsupported file type: ${contentType}. Allowed: .zip, .json` },
        { status: 400 },
      );
    }

    const environment = formData.get("environment") as string | null;
    const tag = formData.get("tag") as string | null;

    // Validate environment if provided
    if (environment && !["dev", "prod", "staging", "test"].includes(environment)) {
      fireLog({
        projectId: project.id, method: "POST", path, statusCode: 400,
        clientIp, userAgent, errorCode: "env_invalid",
        errorMessage: `Invalid environment: ${environment}`,
        startTime, metadata: { environment },
      });
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

    let buffer: Uint8Array;
    try {
      buffer = new Uint8Array(await file.arrayBuffer());
      await uploadToR2(fileKey, buffer, contentType);
    } catch (uploadError) {
      console.error("R2 upload failed:", uploadError);
      fireLog({
        projectId: project.id, method: "POST", path, statusCode: 500,
        clientIp, userAgent, errorCode: "upload_failed",
        errorMessage: uploadError instanceof Error ? uploadError.message : "R2 upload failed",
        startTime, metadata: { file_size: file.size, file_name: file.name },
      });
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }

    // If it's a JSON file, also store a copy with .json key for preview
    let jsonKey: string | undefined;
    if (isJson) {
      jsonKey = `previews/${projectId}/${timestamp}.json`;
      await uploadToR2(jsonKey, buffer, "application/json");
    }

    // --- Extract sender IP ---
    const senderIp = getClientIp(request) ?? "unknown";

    // --- Save metadata to D1 ---
    let backup;
    try {
      backup = await createBackup({
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
    } catch (dbError) {
      console.error("D1 backup insert failed:", dbError);
      fireLog({
        projectId: project.id, method: "POST", path, statusCode: 500,
        clientIp, userAgent, errorCode: "db_failed",
        errorMessage: dbError instanceof Error ? dbError.message : "D1 insert failed",
        startTime, metadata: { file_size: file.size, file_key: fileKey },
      });
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }

    fireLog({
      projectId: project.id, method: "POST", path, statusCode: 201,
      clientIp, userAgent, errorCode: null, errorMessage: null,
      startTime, metadata: {
        backup_id: backup.id,
        file_size: file.size,
        file_name: file.name,
        environment: environment ?? null,
        tag: tag ?? null,
        is_json: isJson,
      },
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
    fireLog({
      projectId: null, method: "POST", path: "/api/webhook/unknown",
      statusCode: 500, clientIp, userAgent, errorCode: "internal_error",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      startTime, metadata: null,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
