import JSZip from "jszip";
import {
  listBackups,
  listEnvironments,
  getBackup,
  deleteBackup,
  deleteBackups,
  createBackup,
  updateBackup,
} from "../lib/db/backups";
import { listProjects, getProject } from "../lib/db/projects";
import {
  detectFileType,
  isPreviewable,
  normalizeContentType,
  isExtractable,
  type FileType,
} from "../lib/backup/file-type";
import {
  generateBackupKey,
  generatePreviewKey,
  generateTimestamp,
} from "../lib/backup/storage";
import { extractJson, MAX_DECOMPRESSED_SIZE } from "../lib/backup/extractors";
import { json, type HandlerResponse } from "../http/response";
import type { RuntimeContext } from "../runtime";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_PREVIEW_SIZE = 5 * 1024 * 1024;
const PRESIGN_EXPIRES_IN = 900;

async function readR2Bytes(result: {
  bytes?: (() => Promise<Uint8Array>) | undefined;
  body?: unknown;
}): Promise<Uint8Array> {
  if (typeof result.bytes === "function") {
    return result.bytes();
  }
  const body = result.body as { transformToByteArray?: () => Promise<Uint8Array> } | null | undefined;
  if (body?.transformToByteArray) {
    return body.transformToByteArray();
  }
  if (result.body instanceof ReadableStream) {
    return new Response(result.body).bytes();
  }
  throw new TypeError("R2 response does not expose bytes()");
}

export interface ListBackupsInput {
  projectId?: string;
  search?: string;
  environment?: string;
  sortBy?: string | null;
  sortOrder?: string | null;
  page?: string | null;
  pageSize?: string | null;
}

function parseSortBy(
  value: string | null | undefined,
): "created_at" | "file_size" | "project_name" {
  if (value === "file_size" || value === "project_name") return value;
  return "created_at";
}

function parseSortOrder(value: string | null | undefined): "asc" | "desc" {
  if (value === "asc") return "asc";
  return "desc";
}

export async function listBackupsHandler(
  input: ListBackupsInput,
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  try {
    const sortBy = parseSortBy(input.sortBy);
    const sortOrder = parseSortOrder(input.sortOrder);
    const page = Math.max(1, parseInt(input.page ?? "1", 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(input.pageSize ?? "20", 10) || 20),
    );
    const [result, environments, projects] = await Promise.all([
      listBackups(ctx.db, {
        ...(input.projectId && { projectId: input.projectId }),
        ...(input.search && { search: input.search }),
        ...(input.environment && { environment: input.environment }),
        sortBy,
        sortOrder,
        page,
        pageSize,
      }),
      listEnvironments(ctx.db),
      listProjects(ctx.db),
    ]);
    const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));
    return json(200, {
      ...result,
      environments,
      projects: projectOptions,
    });
  } catch (error) {
    console.error("Failed to list backups:", error);
    return json(500, { error: "Failed to list backups" });
  }
}

export async function batchDeleteBackupsHandler(
  input: { body: unknown },
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  try {
    const body = input.body as { ids?: unknown };
    const ids = body.ids;
    if (
      !Array.isArray(ids) ||
      ids.length === 0 ||
      ids.some((id) => typeof id !== "string")
    ) {
      return json(400, {
        error: "ids must be a non-empty array of strings",
      });
    }
    if (ids.length > 50) {
      return json(400, {
        error: "Maximum 50 backups can be deleted at once",
      });
    }
    const keys = await deleteBackups(ctx.db, ids as string[]);
    for (const { fileKey, jsonKey } of keys) {
      try {
        await ctx.r2.delete(fileKey);
        if (jsonKey) await ctx.r2.delete(jsonKey);
      } catch (r2Error) {
        console.error("R2 cleanup error (non-fatal):", r2Error);
      }
    }
    return json(200, { success: true, deleted: keys.length });
  } catch (error) {
    console.error("Failed to batch delete backups:", error);
    return json(500, { error: "Failed to batch delete backups" });
  }
}

export async function getBackupHandler(
  input: { id: string },
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  try {
    const backup = await getBackup(ctx.db, input.id);
    if (!backup) return json(404, { error: "Backup not found" });
    return json(200, backup);
  } catch (error) {
    console.error("Failed to get backup:", error);
    return json(500, { error: "Failed to get backup" });
  }
}

export async function deleteBackupHandler(
  input: { id: string },
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  try {
    const keys = await deleteBackup(ctx.db, input.id);
    if (!keys) return json(404, { error: "Backup not found" });
    try {
      await ctx.r2.delete(keys.fileKey);
      if (keys.jsonKey) await ctx.r2.delete(keys.jsonKey);
    } catch (r2Error) {
      console.error("R2 cleanup error (non-fatal):", r2Error);
    }
    return json(200, { success: true });
  } catch (error) {
    console.error("Failed to delete backup:", error);
    return json(500, { error: "Failed to delete backup" });
  }
}

export interface UploadBackupInput {
  formData: FormData;
}

export async function uploadBackupHandler(
  input: UploadBackupInput,
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  try {
    const formData = input.formData;
    const file = formData.get("file");
    const projectId = formData.get("projectId") as string | null;
    const tag = formData.get("tag") as string | null;
    const environment = formData.get("environment") as string | null;

    if (!projectId) return json(400, { error: "projectId is required" });

    const project = await getProject(ctx.db, projectId);
    if (!project) return json(404, { error: "Project not found" });

    if (!file || !(file instanceof File))
      return json(400, { error: "Missing 'file' field in form data" });
    if (file.size === 0) return json(400, { error: "File is empty" });
    if (file.size > MAX_FILE_SIZE)
      return json(413, {
        error: `File too large. Maximum: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      });

    if (
      environment &&
      !["dev", "prod", "staging", "test"].includes(environment)
    )
      return json(400, {
        error: "Invalid environment. Allowed: dev, prod, staging, test",
      });

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
      const zip = new JSZip();
      zip.file(fileName, buffer);
      const zipBuffer = await zip.generateAsync({
        type: "uint8array",
        compression: "DEFLATE",
      });
      fileKey = `backups/${projectId}/${timestamp}.zip`;
      await ctx.r2.put(fileKey, zipBuffer, { contentType: "application/zip" });
      fileSize = zipBuffer.length;
      jsonKey = generatePreviewKey(projectId, timestamp);
      await ctx.r2.put(jsonKey, buffer, { contentType: "application/json" });
    } else {
      fileKey = generateBackupKey(projectId, fileType, fileName, timestamp);
      await ctx.r2.put(fileKey, buffer, { contentType });
      fileSize = buffer.length;
    }

    const backup = await createBackup(ctx.db, {
      projectId,
      ...(environment ? { environment } : {}),
      senderIp: "manual-upload",
      ...(tag ? { tag } : {}),
      fileKey,
      ...(jsonKey ? { jsonKey } : {}),
      fileSize,
      isSingleJson,
      jsonExtracted: false,
      fileType,
    });

    return json(
      201,
      {
        id: backup.id,
        project_id: backup.project_id,
        file_size: fileSize,
        created_at: backup.created_at,
      },
    );
  } catch (error) {
    console.error("Manual upload error:", error);
    return json(500, { error: "Internal server error" });
  }
}

export async function downloadBackupHandler(
  input: { id: string },
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  try {
    const backup = await getBackup(ctx.db, input.id);
    if (!backup) return json(404, { error: "Backup not found" });
    const url = await ctx.r2.presignDownload(
      backup.file_key,
      PRESIGN_EXPIRES_IN,
    );
    return json(200, {
      url,
      file_key: backup.file_key,
      file_size: backup.file_size,
      expires_in: PRESIGN_EXPIRES_IN,
    });
  } catch (error) {
    console.error("Failed to generate download URL:", error);
    return json(500, { error: "Failed to generate download URL" });
  }
}

export async function previewBackupHandler(
  input: { id: string },
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  try {
    const backup = await getBackup(ctx.db, input.id);
    if (!backup) return json(404, { error: "Backup not found" });

    if (!backup.json_key) {
      return json(404, {
        error:
          "No JSON available for preview. Extract JSON first via POST /api/backups/[id]/extract",
        extractable: !backup.is_single_json,
      });
    }

    const r2Response = await ctx.r2.get(backup.json_key);
    if (!r2Response) {
      return json(500, {
        error: "Failed to download preview file from storage",
      });
    }

    const bodyBytes = await readR2Bytes(r2Response);

    if (bodyBytes.byteLength > MAX_PREVIEW_SIZE) {
      return json(413, {
        error:
          "JSON file too large for inline preview. Use the download endpoint instead.",
      });
    }

    const text = new TextDecoder().decode(bodyBytes);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return json(500, { error: "Stored preview file is not valid JSON" });
    }

    return json(200, {
      backup_id: backup.id,
      project_id: backup.project_id,
      project_name: backup.project_name,
      json_key: backup.json_key,
      content: parsed,
    });
  } catch (error) {
    console.error("Failed to load preview:", error);
    return json(500, { error: "Failed to load preview" });
  }
}

export async function extractBackupHandler(
  input: { id: string },
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  try {
    const backup = await getBackup(ctx.db, input.id);
    if (!backup) return json(404, { error: "Backup not found" });

    if (backup.json_key) {
      return json(200, {
        message: "JSON already available",
        json_key: backup.json_key,
      });
    }

    if (backup.is_single_json) {
      return json(400, {
        error: "Backup is already a JSON file, no extraction needed",
      });
    }

    const fileType = (backup.file_type || "unknown") as FileType;
    if (!isExtractable(fileType)) {
      return json(400, {
        error: "Preview is not available for this file format",
      });
    }

    const r2Response = await ctx.r2.get(backup.file_key);
    if (!r2Response) {
      return json(500, {
        error: "Failed to download backup file from storage",
      });
    }

    if (
      r2Response.contentLength &&
      r2Response.contentLength > MAX_DECOMPRESSED_SIZE
    ) {
      return json(400, {
        error: `Archive too large for extraction (${(r2Response.contentLength / 1024 / 1024).toFixed(1)}MB exceeds ${MAX_DECOMPRESSED_SIZE / 1024 / 1024}MB limit)`,
      });
    }

    const archiveBuffer = await readR2Bytes(r2Response);

    const outcome = await extractJson(new Uint8Array(archiveBuffer), fileType);
    if (!outcome.success) {
      return json(400, { error: outcome.reason });
    }

    const jsonKey = generatePreviewKey(backup.project_id);
    await ctx.r2.put(jsonKey, outcome.jsonContent, {
      contentType: "application/json",
    });

    await updateBackup(ctx.db, input.id, {
      jsonKey,
      jsonExtracted: true,
    });

    return json(200, {
      message: "JSON extracted successfully",
      json_key: jsonKey,
      source_file: outcome.sourceFile,
      json_files_found: outcome.jsonFilesFound,
    });
  } catch (error) {
    console.error("Failed to extract JSON:", error);
    return json(500, { error: "Failed to extract JSON from backup" });
  }
}

export async function restoreCommandHandler(
  input: { id: string; baseUrl: string },
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  try {
    const backup = await getBackup(ctx.db, input.id);
    if (!backup) return json(404, { error: "Backup not found" });

    const project = await getProject(ctx.db, backup.project_id);
    if (!project) return json(404, { error: "Project not found" });

    const command = `curl ${input.baseUrl}/api/restore/${backup.id} \\\n  -H "Authorization: Bearer ${project.webhook_token}"`;

    return json(200, { command });
  } catch (error) {
    console.error("Failed to generate restore command:", error);
    return json(500, { error: "Failed to generate restore command" });
  }
}
