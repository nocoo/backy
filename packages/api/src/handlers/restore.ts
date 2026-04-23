import { getBackup } from "../lib/db/backups";
import { getProject } from "../lib/db/projects";
import { createPresignedDownloadUrl } from "../lib/r2/client";
import { isIpAllowed } from "../lib/ip";
import { json, type HandlerResponse } from "../http/response";

const PRESIGN_EXPIRES_IN = 900;

export interface RestoreInput {
  id: string;
  authorization: string | null;
  clientIp: string | null;
}

export async function restoreHandler(
  input: RestoreInput,
): Promise<HandlerResponse> {
  try {
    const auth = input.authorization;
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return json(401, {
        error:
          "Missing authentication. Provide Authorization: Bearer header.",
      });
    }

    const backup = await getBackup(input.id);
    if (!backup) return json(404, { error: "Backup not found" });

    const project = await getProject(backup.project_id);
    if (!project || project.webhook_token !== token) {
      return json(403, { error: "Invalid token" });
    }

    if (project.allowed_ips) {
      if (!input.clientIp || !isIpAllowed(input.clientIp, project.allowed_ips)) {
        return json(403, { error: "Forbidden" });
      }
    }

    const downloadUrl = await createPresignedDownloadUrl(backup.file_key);
    return json(200, {
      url: downloadUrl,
      backup_id: backup.id,
      project_id: backup.project_id,
      file_size: backup.file_size,
      expires_in: PRESIGN_EXPIRES_IN,
    });
  } catch (error) {
    console.error("Restore error:", error);
    return json(500, { error: "Failed to generate restore URL" });
  }
}
