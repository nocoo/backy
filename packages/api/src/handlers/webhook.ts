import { getProjectByToken } from "../lib/db/projects";
import {
  createBackup,
  listBackups,
  countBackups,
} from "../lib/db/backups";
import { uploadToR2 } from "../lib/r2/client";
import { isIpAllowed } from "../lib/ip";
import {
  createWebhookLog,
  type WebhookErrorCode,
} from "../lib/db/webhook-logs";
import {
  detectFileType,
  isPreviewable,
  normalizeContentType,
} from "../lib/backup/file-type";
import {
  generateBackupKey,
  generatePreviewKey,
  generateTimestamp,
} from "../lib/backup/storage";
import { json, empty, type HandlerResponse } from "../http/response";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const VALID_ENVIRONMENTS = ["dev", "prod", "staging", "test"] as const;

interface RequestContext {
  clientIp: string | null;
  userAgent: string | null;
}

interface LogEntry {
  projectId: string | null;
  method: string;
  path: string;
  statusCode: number;
  errorCode: WebhookErrorCode | null;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
  startTime: number;
  ctx: RequestContext;
}

function fireLog(entry: LogEntry) {
  const durationMs = Date.now() - entry.startTime;
  void createWebhookLog({
    projectId: entry.projectId,
    method: entry.method,
    path: entry.path,
    statusCode: entry.statusCode,
    clientIp: entry.ctx.clientIp,
    userAgent: entry.ctx.userAgent,
    errorCode: entry.errorCode,
    errorMessage: entry.errorMessage,
    durationMs,
    metadata: entry.metadata,
  });
}

function checkIp(
  allowedIps: string | null,
  clientIp: string | null,
): boolean {
  if (!allowedIps) return true;
  return clientIp !== null && isIpAllowed(clientIp, allowedIps);
}

function bearer(authorization: string | null): string | null {
  return authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
}

export interface WebhookHeadInput {
  projectId: string;
  authorization: string | null;
  clientIp: string | null;
  userAgent: string | null;
}

export async function webhookHeadHandler(
  input: WebhookHeadInput,
): Promise<HandlerResponse> {
  const startTime = Date.now();
  const ctx: RequestContext = {
    clientIp: input.clientIp,
    userAgent: input.userAgent,
  };
  const path = `/api/webhook/${input.projectId}`;
  try {
    const token = bearer(input.authorization);
    if (!token) {
      fireLog({
        projectId: null, method: "HEAD", path, statusCode: 401,
        errorCode: "auth_missing",
        errorMessage: "Missing or malformed Authorization header",
        metadata: null, startTime, ctx,
      });
      return empty(401);
    }
    const project = await getProjectByToken(token);
    if (!project || project.id !== input.projectId) {
      fireLog({
        projectId: project?.id ?? null, method: "HEAD", path, statusCode: 403,
        errorCode: "auth_invalid",
        errorMessage: "Invalid token or project mismatch",
        metadata: null, startTime, ctx,
      });
      return empty(403);
    }
    if (!checkIp(project.allowed_ips, input.clientIp)) {
      fireLog({
        projectId: project.id, method: "HEAD", path, statusCode: 403,
        errorCode: "ip_blocked",
        errorMessage: "IP not in project allowlist",
        metadata: { allowed_ips: project.allowed_ips }, startTime, ctx,
      });
      return empty(403);
    }
    fireLog({
      projectId: project.id, method: "HEAD", path, statusCode: 200,
      errorCode: null, errorMessage: null, metadata: null, startTime, ctx,
    });
    return empty(200, { "X-Project-Name": project.name });
  } catch (error) {
    console.error("Webhook HEAD error:", error);
    fireLog({
      projectId: null, method: "HEAD", path: "/api/webhook/unknown",
      statusCode: 500, errorCode: "internal_error",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      metadata: null, startTime, ctx,
    });
    return empty(500);
  }
}

export interface WebhookGetInput {
  projectId: string;
  authorization: string | null;
  clientIp: string | null;
  userAgent: string | null;
  environment?: string | undefined;
}

export async function webhookGetHandler(
  input: WebhookGetInput,
): Promise<HandlerResponse> {
  const startTime = Date.now();
  const ctx: RequestContext = {
    clientIp: input.clientIp,
    userAgent: input.userAgent,
  };
  const path = `/api/webhook/${input.projectId}`;
  try {
    const token = bearer(input.authorization);
    if (!token) {
      fireLog({
        projectId: null, method: "GET", path, statusCode: 401,
        errorCode: "auth_missing",
        errorMessage: "Missing or invalid Authorization header",
        metadata: null, startTime, ctx,
      });
      return json(401, { error: "Missing or invalid Authorization header" });
    }
    const project = await getProjectByToken(token);
    if (!project || project.id !== input.projectId) {
      fireLog({
        projectId: project?.id ?? null, method: "GET", path, statusCode: 403,
        errorCode: "auth_invalid",
        errorMessage: "Invalid token or project mismatch",
        metadata: null, startTime, ctx,
      });
      return json(403, { error: "Invalid token or project mismatch" });
    }
    if (!checkIp(project.allowed_ips, input.clientIp)) {
      fireLog({
        projectId: project.id, method: "GET", path, statusCode: 403,
        errorCode: "ip_blocked",
        errorMessage: "IP not in project allowlist",
        metadata: { allowed_ips: project.allowed_ips }, startTime, ctx,
      });
      return json(403, { error: "Forbidden" });
    }
    const environment = input.environment;
    const [total, backups] = await Promise.all([
      countBackups(input.projectId),
      listBackups({
        projectId: input.projectId,
        ...(environment !== undefined && { environment }),
        sortBy: "created_at",
        sortOrder: "desc",
        page: 1,
        pageSize: 5,
      }),
    ]);
    fireLog({
      projectId: project.id, method: "GET", path, statusCode: 200,
      errorCode: null, errorMessage: null,
      metadata: { total_backups: total, environment: environment ?? null },
      startTime, ctx,
    });
    return json(200, {
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
      statusCode: 500, errorCode: "internal_error",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      metadata: null, startTime, ctx,
    });
    return json(500, { error: "Internal server error" });
  }
}

export interface WebhookPostInput {
  projectId: string;
  authorization: string | null;
  clientIp: string | null;
  userAgent: string | null;
  formData: FormData;
}

export async function webhookPostHandler(
  input: WebhookPostInput,
): Promise<HandlerResponse> {
  const startTime = Date.now();
  const ctx: RequestContext = {
    clientIp: input.clientIp,
    userAgent: input.userAgent,
  };
  const path = `/api/webhook/${input.projectId}`;
  try {
    const token = bearer(input.authorization);
    if (!token) {
      fireLog({
        projectId: null, method: "POST", path, statusCode: 401,
        errorCode: "auth_missing",
        errorMessage: "Missing or invalid Authorization header",
        metadata: null, startTime, ctx,
      });
      return json(401, { error: "Missing or invalid Authorization header" });
    }
    const project = await getProjectByToken(token);
    if (!project || project.id !== input.projectId) {
      fireLog({
        projectId: project?.id ?? null, method: "POST", path, statusCode: 403,
        errorCode: "auth_invalid",
        errorMessage: "Invalid token or project mismatch",
        metadata: null, startTime, ctx,
      });
      return json(403, { error: "Invalid token or project mismatch" });
    }
    if (!checkIp(project.allowed_ips, input.clientIp)) {
      fireLog({
        projectId: project.id, method: "POST", path, statusCode: 403,
        errorCode: "ip_blocked",
        errorMessage: "IP not in project allowlist",
        metadata: { allowed_ips: project.allowed_ips }, startTime, ctx,
      });
      return json(403, { error: "Forbidden" });
    }

    const file = input.formData.get("file");
    if (!file || !(file instanceof File)) {
      fireLog({
        projectId: project.id, method: "POST", path, statusCode: 400,
        errorCode: "file_missing",
        errorMessage: "Missing 'file' field in form data",
        metadata: null, startTime, ctx,
      });
      return json(400, { error: "Missing 'file' field in form data" });
    }
    if (file.size === 0) {
      fireLog({
        projectId: project.id, method: "POST", path, statusCode: 400,
        errorCode: "file_empty", errorMessage: "File is empty",
        metadata: { file_name: file.name }, startTime, ctx,
      });
      return json(400, { error: "File is empty" });
    }
    if (file.size > MAX_FILE_SIZE) {
      fireLog({
        projectId: project.id, method: "POST", path, statusCode: 413,
        errorCode: "file_too_large",
        errorMessage: `File too large: ${file.size} bytes (max ${MAX_FILE_SIZE})`,
        metadata: { file_size: file.size, file_name: file.name },
        startTime, ctx,
      });
      return json(413, {
        error: `File too large. Maximum: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      });
    }

    const rawType = file.type || "application/octet-stream";
    const contentType = normalizeContentType(rawType);
    const environment = input.formData.get("environment") as string | null;
    const tag = input.formData.get("tag") as string | null;

    if (
      environment &&
      !VALID_ENVIRONMENTS.includes(environment as (typeof VALID_ENVIRONMENTS)[number])
    ) {
      fireLog({
        projectId: project.id, method: "POST", path, statusCode: 400,
        errorCode: "env_invalid",
        errorMessage: `Invalid environment: ${environment}`,
        metadata: { environment }, startTime, ctx,
      });
      return json(400, {
        error: "Invalid environment. Allowed: dev, prod, staging, test",
      });
    }

    const fileName = file.name || "backup";
    const fileType = detectFileType(fileName, contentType);
    const timestamp = generateTimestamp();
    const fileKey = generateBackupKey(
      input.projectId,
      fileType,
      fileName,
      timestamp,
    );

    let buffer: Uint8Array;
    try {
      buffer = new Uint8Array(await file.arrayBuffer());
      await uploadToR2(fileKey, buffer, contentType);
    } catch (uploadError) {
      console.error("R2 upload failed:", uploadError);
      fireLog({
        projectId: project.id, method: "POST", path, statusCode: 500,
        errorCode: "upload_failed",
        errorMessage:
          uploadError instanceof Error ? uploadError.message : "R2 upload failed",
        metadata: { file_size: file.size, file_name: file.name },
        startTime, ctx,
      });
      return json(500, { error: "Internal server error" });
    }

    let jsonKey: string | undefined;
    if (isPreviewable(fileType)) {
      jsonKey = generatePreviewKey(input.projectId, timestamp);
      await uploadToR2(jsonKey, buffer, "application/json");
    }

    const senderIp = input.clientIp ?? "unknown";

    let backup;
    try {
      backup = await createBackup({
        projectId: input.projectId,
        ...(environment ? { environment } : {}),
        senderIp,
        ...(tag ? { tag } : {}),
        fileKey,
        ...(jsonKey !== undefined && { jsonKey }),
        fileSize: file.size,
        isSingleJson: isPreviewable(fileType),
        jsonExtracted: false,
        fileType,
      });
    } catch (dbError) {
      console.error("D1 backup insert failed:", dbError);
      fireLog({
        projectId: project.id, method: "POST", path, statusCode: 500,
        errorCode: "db_failed",
        errorMessage:
          dbError instanceof Error ? dbError.message : "D1 insert failed",
        metadata: { file_size: file.size, file_key: fileKey },
        startTime, ctx,
      });
      return json(500, { error: "Internal server error" });
    }

    fireLog({
      projectId: project.id, method: "POST", path, statusCode: 201,
      errorCode: null, errorMessage: null,
      metadata: {
        backup_id: backup.id,
        file_size: file.size,
        file_name: file.name,
        environment: environment ?? null,
        tag: tag ?? null,
        is_json: isPreviewable(fileType),
        file_type: fileType,
      },
      startTime, ctx,
    });
    return json(
      201,
      {
        id: backup.id,
        project_id: backup.project_id,
        file_size: backup.file_size,
        created_at: backup.created_at,
      },
    );
  } catch (error) {
    console.error("Webhook error:", error);
    fireLog({
      projectId: null, method: "POST", path: "/api/webhook/unknown",
      statusCode: 500, errorCode: "internal_error",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      metadata: null, startTime, ctx,
    });
    return json(500, { error: "Internal server error" });
  }
}
