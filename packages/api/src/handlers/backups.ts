import JSZip from "jszip";
import {
  listBackups,
  listEnvironments,
  getBackup,
  deleteBackup,
  deleteBackups,
  createBackup,
} from "../lib/db/backups";
import { listProjects, getProject } from "../lib/db/projects";
import { deleteFromR2, uploadToR2 } from "../lib/r2/client";
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
import { json, type HandlerResponse } from "../http/response";

const MAX_FILE_SIZE = 50 * 1024 * 1024;

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
