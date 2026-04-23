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
  deleteFromR2,
  uploadToR2,
  downloadFromR2,
  createPresignedDownloadUrl,
} from "../lib/r2/client";
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

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_PREVIEW_SIZE = 5 * 1024 * 1024;
const PRESIGN_EXPIRES_IN = 900;

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
      listBackups({
        ...(input.projectId && { projectId: input.projectId }),
        ...(input.search && { search: input.search }),
        ...(input.environment && { environment: input.environment }),
        sortBy,
        sortOrder,
        page,
        pageSize,
      }),
      listEnvironments(),
      listProjects(),
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

export async function batchDeleteBackupsHandler(input: {
  body: unknown;
}): Promise<HandlerResponse> {
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
    const keys = await deleteBackups(ids as string[]);
    for (const { fileKey, jsonKey } of keys) {
      try {
        await deleteFromR2(fileKey);
        if (jsonKey) await deleteFromR2(jsonKey);
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

export async function getBackupHandler(input: {
  id: string;
}): Promise<HandlerResponse> {
  try {
    const backup = await getBackup(input.id);
    if (!backup) return json(404, { error: "Backup not found" });
    return json(200, backup);
  } catch (error) {
    console.error("Failed to get backup:", error);
    return json(500, { error: "Failed to get backup" });
  }
}

export async function deleteBackupHandler(input: {
  id: string;
}): Promise<HandlerResponse> {
  try {
    const keys = await deleteBackup(input.id);
    if (!keys) return json(404, { error: "Backup not found" });
    try {
      await deleteFromR2(keys.fileKey);
      if (keys.jsonKey) await deleteFromR2(keys.jsonKey);
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
): Promise<HandlerResponse> {
  try {
    const formData = input.formData;
    const file = formData.get("file");
    const projectId = formData.get("projectId") as string | null;
    const tag = formData.get("tag") as string | null;
    const environment = formData.get("environment") as string | null;

    if (!projectId) return json(400, { error: "projectId is required" });

    const project = await getProject(projectId);
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
      await uploadToR2(fileKey, zipBuffer, "application/zip");
      fileSize = zipBuffer.length;
      jsonKey = generatePreviewKey(projectId, timestamp);
      await uploadToR2(jsonKey, buffer, "application/json");
    } else {
      fileKey = generateBackupKey(projectId, fileType, fileName, timestamp);
      await uploadToR2(fileKey, buffer, contentType);
      fileSize = buffer.length;
    }

    const backup = await createBackup({
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

export async function downloadBackupHandler(input: {
  id: string;
}): Promise<HandlerResponse> {
  try {
    const backup = await getBackup(input.id);
    if (!backup) return json(404, { error: "Backup not found" });
    const url = await createPresignedDownloadUrl(backup.file_key);
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

export async function previewBackupHandler(input: {
  id: string;
}): Promise<HandlerResponse> {
  try {
    const backup = await getBackup(input.id);
    if (!backup) return json(404, { error: "Backup not found" });

    if (!backup.json_key) {
      return json(404, {
        error:
          "No JSON available for preview. Extract JSON first via POST /api/backups/[id]/extract",
        extractable: !backup.is_single_json,
      });
    }

    const r2Response = await downloadFromR2(backup.json_key);
    if (!r2Response.body) {
      return json(500, {
        error: "Failed to download preview file from storage",
      });
    }

    const bodyBytes = await (
      r2Response.body as { transformToByteArray: () => Promise<Uint8Array> }
    ).transformToByteArray();

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

export async function extractBackupHandler(input: {
  id: string;
}): Promise<HandlerResponse> {
  try {
    const backup = await getBackup(input.id);
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

    const r2Response = await downloadFromR2(backup.file_key);
    if (!r2Response.body) {
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

    const archiveBuffer = await (
      r2Response.body as { transformToByteArray: () => Promise<Uint8Array> }
    ).transformToByteArray();

    const outcome = await extractJson(new Uint8Array(archiveBuffer), fileType);
    if (!outcome.success) {
      return json(400, { error: outcome.reason });
    }

    const jsonKey = generatePreviewKey(backup.project_id);
    await uploadToR2(jsonKey, outcome.jsonContent, "application/json");

    await updateBackup(input.id, {
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

export async function restoreCommandHandler(input: {
  id: string;
  baseUrl: string;
}): Promise<HandlerResponse> {
  try {
    const backup = await getBackup(input.id);
    if (!backup) return json(404, { error: "Backup not found" });

    const project = await getProject(backup.project_id);
    if (!project) return json(404, { error: "Project not found" });

    const command = `curl ${input.baseUrl}/api/restore/${backup.id} \\\n  -H "Authorization: Bearer ${project.webhook_token}"`;

    return json(200, { command });
  } catch (error) {
    console.error("Failed to generate restore command:", error);
    return json(500, { error: "Failed to generate restore command" });
  }
}
