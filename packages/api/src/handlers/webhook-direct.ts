import { getProjectByToken } from "../lib/db/projects";
import {
  createBackup,
  getBackup,
  getBackupByFileKey,
  type Backup,
} from "../lib/db/backups";
import { isIpAllowed } from "../lib/ip";
import {
  createWebhookLog,
  type WebhookErrorCode,
} from "../lib/db/webhook-logs";
import {
  detectFileType,
  normalizeContentType,
} from "../lib/backup/file-type";
import { json, type HandlerResponse } from "../http/response";
import { isS3R2Configured } from "../lib/r2/s3-adapter";
import { generateId } from "../lib/id";
import {
  MAX_DIRECT_BYTES,
  MAX_KEY_BYTES,
  MAX_PREVIEW_SIZE,
  LEASE_TTL_SECONDS,
  PUT_TTL_SECONDS,
  PURGE_GRACE_SECONDS,
  REAP_GRACE_SECONDS,
  VALID_ENVIRONMENTS,
  directExtension,
  generateDirectFinalKey,
  generateDirectStagingKey,
  unixNow,
  utf8ByteLength,
  validateFileName,
} from "../lib/direct-upload";
import {
  abortCompletingWithLease,
  abortPendingDirectUpload,
  attachCompletedBackup,
  purgeUnissuedDirectUpload,
  claimDirectUpload,
  completeDirectUpload,
  getDirectUpload,
  insertPendingDirectUpload,
  renewDirectUploadLease,
  type DirectUploadRow,
} from "../lib/db/direct-uploads";
import type { RuntimeContext } from "../runtime";
import type { Project } from "../lib/db/projects";

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

function fireLog(runtime: RuntimeContext, entry: LogEntry) {
  const durationMs = Date.now() - entry.startTime;
  const pending = createWebhookLog(runtime.db, {
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
  if (runtime.defer) runtime.defer(pending);
  else void pending;
}

function checkIp(allowedIps: string | null, clientIp: string | null): boolean {
  if (!allowedIps) return true;
  return clientIp !== null && isIpAllowed(clientIp, allowedIps);
}

function bearer(authorization: string | null): string | null {
  return authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
}

function logMeta(fields: Record<string, unknown>): Record<string, unknown> {
  const allow = [
    "upload_id",
    "backup_id",
    "file_size",
    "file_name",
    "environment",
    "tag",
    "file_type",
    "error_code",
    "file_key",
  ];
  const out: Record<string, unknown> = {};
  for (const key of allow) {
    if (fields[key] !== undefined) out[key] = fields[key];
  }
  return out;
}

type AuthOk = {
  ok: true;
  project: Project;
  startTime: number;
  reqCtx: RequestContext;
};
type AuthFail = { ok: false; response: HandlerResponse };

async function authenticate(
  input: {
    projectId: string;
    authorization: string | null;
    clientIp: string | null;
    userAgent: string | null;
  },
  ctx: RuntimeContext,
  method: string,
  path: string,
): Promise<AuthOk | AuthFail> {
  const startTime = Date.now();
  const reqCtx: RequestContext = {
    clientIp: input.clientIp,
    userAgent: input.userAgent,
  };
  const token = bearer(input.authorization);
  if (!token) {
    fireLog(ctx, {
      projectId: null,
      method,
      path,
      statusCode: 401,
      errorCode: "auth_missing",
      errorMessage: "Missing or invalid Authorization header",
      metadata: null,
      startTime,
      ctx: reqCtx,
    });
    return {
      ok: false,
      response: json(401, { error: "Missing or invalid Authorization header" }),
    };
  }
  const project = await getProjectByToken(ctx.db, token);
  if (!project || project.id !== input.projectId) {
    fireLog(ctx, {
      projectId: project?.id ?? null,
      method,
      path,
      statusCode: 403,
      errorCode: "auth_invalid",
      errorMessage: "Invalid token or project mismatch",
      metadata: null,
      startTime,
      ctx: reqCtx,
    });
    return {
      ok: false,
      response: json(403, { error: "Invalid token or project mismatch" }),
    };
  }
  if (!checkIp(project.allowed_ips, input.clientIp)) {
    fireLog(ctx, {
      projectId: project.id,
      method,
      path,
      statusCode: 403,
      errorCode: "ip_blocked",
      errorMessage: "IP not in project allowlist",
      metadata: { allowed_ips: project.allowed_ips },
      startTime,
      ctx: reqCtx,
    });
    return { ok: false, response: json(403, { error: "Forbidden" }) };
  }
  return { ok: true, project, startTime, reqCtx };
}

export interface DirectUploadInitInput {
  projectId: string;
  authorization: string | null;
  clientIp: string | null;
  userAgent: string | null;
  body: unknown;
}

export async function webhookInitUploadHandler(
  input: DirectUploadInitInput,
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  const path = `/api/webhook/${input.projectId}/uploads`;
  try {
    const auth = await authenticate(input, ctx, "POST", path);
    if (!auth.ok) return auth.response;
    const { project, startTime, reqCtx } = auth;

    const body =
      input.body && typeof input.body === "object"
        ? (input.body as Record<string, unknown>)
        : null;
    if (!body) {
      fireLog(ctx, {
        projectId: project.id,
        method: "POST",
        path,
        statusCode: 400,
        errorCode: "validation",
        errorMessage: "JSON body required",
        metadata: null,
        startTime,
        ctx: reqCtx,
      });
      return json(400, { error: "JSON body required" });
    }

    const nameError = validateFileName(body.file_name);
    if (nameError) {
      fireLog(ctx, {
        projectId: project.id,
        method: "POST",
        path,
        statusCode: 400,
        errorCode: "validation",
        errorMessage: nameError,
        metadata: logMeta({ error_code: "validation" }),
        startTime,
        ctx: reqCtx,
      });
      return json(400, { error: nameError });
    }
    const fileName = body.file_name as string;

    const fileSize = body.file_size;
    if (
      typeof fileSize !== "number" ||
      !Number.isInteger(fileSize) ||
      fileSize < 1 ||
      fileSize > MAX_DIRECT_BYTES
    ) {
      fireLog(ctx, {
        projectId: project.id,
        method: "POST",
        path,
        statusCode: 400,
        errorCode: "validation",
        errorMessage: "file_size must be an integer from 1 to 5000000000",
        metadata: logMeta({ file_name: fileName, error_code: "validation" }),
        startTime,
        ctx: reqCtx,
      });
      return json(400, {
        error: "file_size must be an integer from 1 to 5000000000",
      });
    }

    const environment =
      typeof body.environment === "string" ? body.environment : undefined;
    if (
      environment &&
      !VALID_ENVIRONMENTS.includes(
        environment as (typeof VALID_ENVIRONMENTS)[number],
      )
    ) {
      fireLog(ctx, {
        projectId: project.id,
        method: "POST",
        path,
        statusCode: 400,
        errorCode: "env_invalid",
        errorMessage: `Invalid environment: ${environment}`,
        metadata: logMeta({ environment, file_name: fileName }),
        startTime,
        ctx: reqCtx,
      });
      return json(400, {
        error: "Invalid environment. Allowed: dev, prod, staging, test",
      });
    }

    const tag = typeof body.tag === "string" ? body.tag : undefined;
    const rawType =
      typeof body.content_type === "string" && body.content_type.length > 0
        ? body.content_type
        : "application/octet-stream";
    const contentType = normalizeContentType(rawType);
    const fileType = detectFileType(fileName, contentType);
    const ext = directExtension(fileType, fileName);
    const uploadId = generateId();
    const stagingKey = generateDirectStagingKey(input.projectId, uploadId, ext);
    const fileKey = generateDirectFinalKey(input.projectId, uploadId, ext);
    if (
      utf8ByteLength(stagingKey) > MAX_KEY_BYTES ||
      utf8ByteLength(fileKey) > MAX_KEY_BYTES
    ) {
      fireLog(ctx, {
        projectId: project.id,
        method: "POST",
        path,
        statusCode: 400,
        errorCode: "validation",
        errorMessage: "generated object key exceeds 1024 bytes",
        metadata: logMeta({ file_name: fileName }),
        startTime,
        ctx: reqCtx,
      });
      return json(400, { error: "generated object key exceeds 1024 bytes" });
    }

    if (!isS3R2Configured(ctx.env)) {
      fireLog(ctx, {
        projectId: project.id,
        method: "POST",
        path,
        statusCode: 503,
        errorCode: "s3_unconfigured",
        errorMessage: "R2 S3 credentials are not configured",
        metadata: logMeta({ file_name: fileName, file_size: fileSize }),
        startTime,
        ctx: reqCtx,
      });
      return json(503, { error: "Direct upload is not configured" });
    }

    const now = unixNow();
    const expiresAt = now + PUT_TTL_SECONDS;
    const purgeAfter = expiresAt + PURGE_GRACE_SECONDS;
    const reapUntil = purgeAfter + REAP_GRACE_SECONDS;
    const inserted = await insertPendingDirectUpload(ctx.db, {
      id: uploadId,
      projectId: input.projectId,
      fileKey,
      stagingKey,
      fileName,
      contentType,
      declaredSize: fileSize,
      environment: environment ?? null,
      tag: tag ?? null,
      senderIp: input.clientIp,
      expiresAt,
      purgeAfter,
      reapUntil,
      nextGcAt: purgeAfter,
      createdAt: now,
    });
    if (!inserted) {
      fireLog(ctx, {
        projectId: project.id,
        method: "POST",
        path,
        statusCode: 429,
        errorCode: "quota_exceeded",
        errorMessage: "Direct upload quota exceeded",
        metadata: logMeta({
          file_name: fileName,
          file_size: fileSize,
          error_code: "quota_exceeded",
        }),
        startTime,
        ctx: reqCtx,
      });
      return json(429, { error: "Direct upload quota exceeded" });
    }

    let putUrl: string;
    try {
      putUrl = await ctx.r2.presignUpload(stagingKey, PUT_TTL_SECONDS, {
        contentType,
        contentLength: fileSize,
      });
    } catch (signError) {
      await purgeUnissuedDirectUpload(ctx.db, uploadId, unixNow());
      fireLog(ctx, {
        projectId: project.id,
        method: "POST",
        path,
        statusCode: 500,
        errorCode: "internal_error",
        errorMessage:
          signError instanceof Error ? signError.message : "presign failed",
        metadata: logMeta({ upload_id: uploadId, file_name: fileName }),
        startTime,
        ctx: reqCtx,
      });
      return json(500, { error: "Internal server error" });
    }
    fireLog(ctx, {
      projectId: project.id,
      method: "POST",
      path,
      statusCode: 200,
      errorCode: null,
      errorMessage: null,
      metadata: logMeta({
        upload_id: uploadId,
        file_size: fileSize,
        file_name: fileName,
        environment: environment ?? null,
        tag: tag ?? null,
        file_type: fileType,
        file_key: fileKey,
      }),
      startTime,
      ctx: reqCtx,
    });
    return json(200, {
      upload_id: uploadId,
      put_url: putUrl,
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fileSize),
        "If-None-Match": "*",
      },
      file_key: fileKey,
      expires_in: PUT_TTL_SECONDS,
      max_bytes: MAX_DIRECT_BYTES,
    });
  } catch (error) {
    console.error("Direct upload init error:", error);
    fireLog(ctx, {
      projectId: null,
      method: "POST",
      path,
      statusCode: 500,
      errorCode: "internal_error",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      metadata: null,
      startTime: Date.now(),
      ctx: { clientIp: input.clientIp, userAgent: input.userAgent },
    });
    return json(500, { error: "Internal server error" });
  }
}

export interface DirectUploadCompleteInput {
  projectId: string;
  uploadId: string;
  authorization: string | null;
  clientIp: string | null;
  userAgent: string | null;
}

function backupBody(backup: {
  id: string;
  project_id: string;
  file_size: number;
  created_at: string;
}) {
  return {
    id: backup.id,
    project_id: backup.project_id,
    file_size: backup.file_size,
    created_at: backup.created_at,
  };
}

async function completeGone(
  ctx: RuntimeContext,
  auth: AuthOk,
  path: string,
  upload: DirectUploadRow | undefined,
  message: string,
): Promise<HandlerResponse> {
  fireLog(ctx, {
    projectId: auth.project.id,
    method: "POST",
    path,
    statusCode: 410,
    errorCode: "upload_gone",
    errorMessage: message,
    metadata: logMeta({
      upload_id: upload?.id,
      error_code: "upload_gone",
    }),
    startTime: auth.startTime,
    ctx: auth.reqCtx,
  });
  return json(410, { error: message });
}

export async function webhookCompleteUploadHandler(
  input: DirectUploadCompleteInput,
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  const path = `/api/webhook/${input.projectId}/uploads/${input.uploadId}/complete`;
  try {
    const auth = await authenticate(input, ctx, "POST", path);
    if (!auth.ok) return auth.response;
    const { project, startTime, reqCtx } = auth;
    let now = unixNow();
    const upload = await getDirectUpload(ctx.db, input.uploadId, input.projectId);
    if (!upload) {
      fireLog(ctx, {
        projectId: project.id,
        method: "POST",
        path,
        statusCode: 404,
        errorCode: "upload_gone",
        errorMessage: "Upload not found",
        metadata: logMeta({ upload_id: input.uploadId }),
        startTime,
        ctx: reqCtx,
      });
      return json(404, { error: "Upload not found" });
    }

    if (upload.status === "completed") {
      if (upload.backup_id) {
        const existing = await getBackup(ctx.db, upload.backup_id);
        if (existing) {
          fireLog(ctx, {
            projectId: project.id,
            method: "POST",
            path,
            statusCode: 201,
            errorCode: null,
            errorMessage: null,
            metadata: logMeta({
              upload_id: upload.id,
              backup_id: existing.id,
              file_size: existing.file_size,
            }),
            startTime,
            ctx: reqCtx,
          });
          return json(201, backupBody(existing));
        }
      }
      return completeGone(ctx, auth, path, upload, "Upload is no longer completable");
    }

    if (upload.status === "aborted" || upload.status === "expired") {
      return completeGone(ctx, auth, path, upload, "Upload is no longer completable");
    }
    if (now >= upload.purge_after) {
      return completeGone(ctx, auth, path, upload, "Upload is no longer completable");
    }

    const leaseToken = generateId();
    const claimed = await claimDirectUpload(ctx.db, {
      id: upload.id,
      projectId: input.projectId,
      leaseToken,
      now,
      leaseExpiresAt: now + LEASE_TTL_SECONDS,
    });
    if (!claimed) {
      const latest = await getDirectUpload(ctx.db, upload.id, input.projectId);
      if (
        latest?.status === "completing" &&
        latest.lease_expires_at !== null &&
        latest.lease_expires_at > now
      ) {
        fireLog(ctx, {
          projectId: project.id,
          method: "POST",
          path,
          statusCode: 409,
          errorCode: "upload_conflict",
          errorMessage: "Upload is being completed",
          metadata: logMeta({ upload_id: upload.id }),
          startTime,
          ctx: reqCtx,
        });
        return json(409, { error: "Upload is being completed" });
      }
      if (latest?.status === "completed" && latest.backup_id) {
        const existing = await getBackup(ctx.db, latest.backup_id);
        if (existing) {
          fireLog(ctx, {
            projectId: project.id,
            method: "POST",
            path,
            statusCode: 201,
            errorCode: null,
            errorMessage: null,
            metadata: logMeta({
              upload_id: upload.id,
              backup_id: existing.id,
              file_size: existing.file_size,
            }),
            startTime,
            ctx: reqCtx,
          });
          return json(201, backupBody(existing));
        }
      }
      return completeGone(ctx, auth, path, latest ?? upload, "Upload is no longer completable");
    }

    const head = await ctx.r2.head(upload.staging_key);
    if (!head) {
      await abortCompletingWithLease(ctx.db, upload.id, leaseToken);
      fireLog(ctx, {
        projectId: project.id,
        method: "POST",
        path,
        statusCode: 404,
        errorCode: "upload_gone",
        errorMessage: "Staging object not found",
        metadata: logMeta({ upload_id: upload.id, file_key: upload.file_key }),
        startTime,
        ctx: reqCtx,
      });
      return json(404, { error: "Staging object not found" });
    }
    if (head.contentLength !== upload.declared_size) {
      await abortCompletingWithLease(ctx.db, upload.id, leaseToken);
      fireLog(ctx, {
        projectId: project.id,
        method: "POST",
        path,
        statusCode: 409,
        errorCode: "size_mismatch",
        errorMessage: "Object size does not match declared file_size",
        metadata: logMeta({
          upload_id: upload.id,
          file_size: head.contentLength,
        }),
        startTime,
        ctx: reqCtx,
      });
      return json(409, { error: "Object size does not match declared file_size" });
    }

    const existingByKey = await getBackupByFileKey(ctx.db, upload.file_key);
    if (existingByKey) {
      if (existingByKey.project_id !== input.projectId) {
        await abortCompletingWithLease(ctx.db, upload.id, leaseToken);
        fireLog(ctx, {
          projectId: project.id,
          method: "POST",
          path,
          statusCode: 409,
          errorCode: "upload_conflict",
          errorMessage: "file_key already belongs to another project",
          metadata: logMeta({ upload_id: upload.id }),
          startTime,
          ctx: reqCtx,
        });
        return json(409, { error: "file_key conflict" });
      }
      await attachCompletedBackup(ctx.db, {
        id: upload.id,
        backupId: existingByKey.id,
        now,
      });
      fireLog(ctx, {
        projectId: project.id,
        method: "POST",
        path,
        statusCode: 201,
        errorCode: null,
        errorMessage: null,
        metadata: logMeta({
          upload_id: upload.id,
          backup_id: existingByKey.id,
          file_size: existingByKey.file_size,
        }),
        startTime,
        ctx: reqCtx,
      });
      return json(201, backupBody(existingByKey));
    }

    now = unixNow();
    const renewed = await renewDirectUploadLease(ctx.db, {
      id: upload.id,
      leaseToken,
      now,
      leaseExpiresAt: now + LEASE_TTL_SECONDS,
    });
    if (!renewed) {
      fireLog(ctx, {
        projectId: project.id,
        method: "POST",
        path,
        statusCode: 409,
        errorCode: "upload_conflict",
        errorMessage: "Upload lease lost",
        metadata: logMeta({ upload_id: upload.id }),
        startTime,
        ctx: reqCtx,
      });
      return json(409, { error: "Upload lease lost" });
    }

    await ctx.r2.copy(upload.staging_key, upload.file_key);
    const finalHead = await ctx.r2.head(upload.file_key);
    if (!finalHead || finalHead.contentLength !== upload.declared_size) {
      await abortCompletingWithLease(ctx.db, upload.id, leaseToken);
      fireLog(ctx, {
        projectId: project.id,
        method: "POST",
        path,
        statusCode: 409,
        errorCode: "size_mismatch",
        errorMessage: "Copied object missing or size mismatch",
        metadata: logMeta({ upload_id: upload.id, file_key: upload.file_key }),
        startTime,
        ctx: reqCtx,
      });
      return json(409, { error: "Copied object missing or size mismatch" });
    }

    now = unixNow();
    const renewedAfterCopy = await renewDirectUploadLease(ctx.db, {
      id: upload.id,
      leaseToken,
      now,
      leaseExpiresAt: now + LEASE_TTL_SECONDS,
    });
    if (!renewedAfterCopy) {
      fireLog(ctx, {
        projectId: project.id,
        method: "POST",
        path,
        statusCode: 409,
        errorCode: "upload_conflict",
        errorMessage: "Upload lease lost",
        metadata: logMeta({ upload_id: upload.id }),
        startTime,
        ctx: reqCtx,
      });
      return json(409, { error: "Upload lease lost" });
    }

    const fileType = detectFileType(upload.file_name, upload.content_type);
    const previewableJson =
      fileType === "json" && finalHead.contentLength <= MAX_PREVIEW_SIZE;

    let backup: Backup;
    try {
      backup = await createBackup(ctx.db, {
        projectId: input.projectId,
        ...(upload.environment ? { environment: upload.environment } : {}),
        senderIp: upload.sender_ip ?? input.clientIp ?? "unknown",
        ...(upload.tag ? { tag: upload.tag } : {}),
        fileKey: upload.file_key,
        ...(previewableJson ? { jsonKey: upload.file_key } : {}),
        fileSize: finalHead.contentLength,
        isSingleJson: previewableJson,
        jsonExtracted: false,
        fileType,
      });
    } catch (dbError) {
      const message =
        dbError instanceof Error ? dbError.message : "backup insert failed";
      if (/unique/i.test(message)) {
        const conflict = await getBackupByFileKey(ctx.db, upload.file_key);
        if (conflict && conflict.project_id === input.projectId) {
          now = unixNow();
          await attachCompletedBackup(ctx.db, {
            id: upload.id,
            backupId: conflict.id,
            now,
          });
          fireLog(ctx, {
            projectId: project.id,
            method: "POST",
            path,
            statusCode: 201,
            errorCode: null,
            errorMessage: null,
            metadata: logMeta({
              upload_id: upload.id,
              backup_id: conflict.id,
              file_size: conflict.file_size,
            }),
            startTime,
            ctx: reqCtx,
          });
          return json(201, backupBody(conflict));
        }
        await abortCompletingWithLease(ctx.db, upload.id, leaseToken);
        fireLog(ctx, {
          projectId: project.id,
          method: "POST",
          path,
          statusCode: 409,
          errorCode: "upload_conflict",
          errorMessage: message,
          metadata: logMeta({ upload_id: upload.id, file_key: upload.file_key }),
          startTime,
          ctx: reqCtx,
        });
        return json(409, { error: "file_key conflict" });
      }
      fireLog(ctx, {
        projectId: project.id,
        method: "POST",
        path,
        statusCode: 500,
        errorCode: "db_failed",
        errorMessage: message,
        metadata: logMeta({ upload_id: upload.id, file_key: upload.file_key }),
        startTime,
        ctx: reqCtx,
      });
      return json(500, { error: "Internal server error" });
    }

    now = unixNow();
    const finalized = await completeDirectUpload(ctx.db, {
      id: upload.id,
      leaseToken,
      backupId: backup.id,
      now,
    });
    if (!finalized) {
      fireLog(ctx, {
        projectId: project.id,
        method: "POST",
        path,
        statusCode: 409,
        errorCode: "upload_conflict",
        errorMessage: "Upload lease lost after insert",
        metadata: logMeta({
          upload_id: upload.id,
          backup_id: backup.id,
        }),
        startTime,
        ctx: reqCtx,
      });
      return json(409, { error: "Upload lease lost" });
    }

    fireLog(ctx, {
      projectId: project.id,
      method: "POST",
      path,
      statusCode: 201,
      errorCode: null,
      errorMessage: null,
      metadata: logMeta({
        upload_id: upload.id,
        backup_id: backup.id,
        file_size: backup.file_size,
        file_name: upload.file_name,
        environment: upload.environment,
        tag: upload.tag,
        file_type: fileType,
        file_key: upload.file_key,
      }),
      startTime,
      ctx: reqCtx,
    });
    return json(201, backupBody(backup));
  } catch (error) {
    console.error("Direct upload complete error:", error);
    fireLog(ctx, {
      projectId: null,
      method: "POST",
      path,
      statusCode: 500,
      errorCode: "internal_error",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      metadata: null,
      startTime: Date.now(),
      ctx: { clientIp: input.clientIp, userAgent: input.userAgent },
    });
    return json(500, { error: "Internal server error" });
  }
}

export interface DirectUploadAbortInput {
  projectId: string;
  uploadId: string;
  authorization: string | null;
  clientIp: string | null;
  userAgent: string | null;
}

export async function webhookAbortUploadHandler(
  input: DirectUploadAbortInput,
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  const path = `/api/webhook/${input.projectId}/uploads/${input.uploadId}`;
  try {
    const auth = await authenticate(input, ctx, "DELETE", path);
    if (!auth.ok) return auth.response;
    const { project, startTime, reqCtx } = auth;
    const upload = await getDirectUpload(ctx.db, input.uploadId, input.projectId);
    if (!upload) {
      fireLog(ctx, {
        projectId: project.id,
        method: "DELETE",
        path,
        statusCode: 404,
        errorCode: "upload_gone",
        errorMessage: "Upload not found",
        metadata: logMeta({ upload_id: input.uploadId }),
        startTime,
        ctx: reqCtx,
      });
      return json(404, { error: "Upload not found" });
    }
    const aborted = await abortPendingDirectUpload(
      ctx.db,
      upload.id,
      input.projectId,
    );
    if (aborted || upload.status === "aborted") {
      fireLog(ctx, {
        projectId: project.id,
        method: "DELETE",
        path,
        statusCode: 200,
        errorCode: null,
        errorMessage: null,
        metadata: logMeta({ upload_id: upload.id }),
        startTime,
        ctx: reqCtx,
      });
      return json(200, { ok: true });
    }
    fireLog(ctx, {
      projectId: project.id,
      method: "DELETE",
      path,
      statusCode: 409,
      errorCode: "upload_conflict",
      errorMessage: `Cannot abort upload in status ${upload.status}`,
      metadata: logMeta({ upload_id: upload.id }),
      startTime,
      ctx: reqCtx,
    });
    return json(409, { error: "Cannot abort upload in its current state" });
  } catch (error) {
    console.error("Direct upload abort error:", error);
    fireLog(ctx, {
      projectId: null,
      method: "DELETE",
      path,
      statusCode: 500,
      errorCode: "internal_error",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      metadata: null,
      startTime: Date.now(),
      ctx: { clientIp: input.clientIp, userAgent: input.userAgent },
    });
    return json(500, { error: "Internal server error" });
  }
}
