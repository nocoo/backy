import { getBackup } from "../lib/db/backups";
import { getProject } from "../lib/db/projects";
import { isIpAllowed } from "../lib/ip";
import { json, type HandlerResponse } from "../http/response";
import type { RuntimeContext } from "../runtime";

const PRESIGN_EXPIRES_IN = 900;

export interface RestoreInput {
  id: string;
  authorization: string | null;
  queryToken: string | null;
  clientIp: string | null;
}

export async function restoreHandler(
  input: RestoreInput,
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  try {
    const auth = input.authorization;
    const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    const token = bearer ?? input.queryToken;
    if (!token) {
      return json(401, {
        error:
          "Missing authentication. Provide Authorization: Bearer header or ?token= query param.",
      });
    }

    const backup = await getBackup(ctx.db, input.id);
    if (!backup) return json(404, { error: "Backup not found" });

    const project = await getProject(ctx.db, backup.project_id);
    if (!project || project.webhook_token !== token) {
      return json(403, { error: "Invalid token" });
    }

    if (project.allowed_ips) {
      if (!input.clientIp || !isIpAllowed(input.clientIp, project.allowed_ips)) {
        return json(403, { error: "Forbidden" });
      }
    }

    const downloadUrl = await ctx.r2.presignDownload(
      backup.file_key,
      PRESIGN_EXPIRES_IN,
    );
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
