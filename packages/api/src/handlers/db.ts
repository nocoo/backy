import { initializeSchema } from "../lib/db/schema";
import { executeD1Query } from "../lib/db/d1-client";
import { deleteFromR2 } from "../lib/r2/client";
import { TEST_PROJECT } from "../lib/test-project";
import { json, type HandlerResponse } from "../http/response";

export async function dbInitHandler(): Promise<HandlerResponse> {
  try {
    await initializeSchema();
    return json(200, { success: true, message: "Schema initialized" });
  } catch (error) {
    console.error("Schema initialization failed:", error);
    return json(500, { error: "Schema initialization failed" });
  }
}

export async function seedTestProjectHandler(): Promise<HandlerResponse> {
  if (process.env.E2E_SKIP_AUTH !== "true") {
    return json(403, { error: "Forbidden" });
  }

  const { id, name, webhookToken, description } = TEST_PROJECT;

  try {
    const orphanedBackups = await executeD1Query<{
      id: string;
      file_key: string;
      json_key: string | null;
    }>(
      "SELECT id, file_key, json_key FROM backups WHERE project_id = ?",
      [id],
    );
    if (orphanedBackups.length > 0) {
      const r2Keys = orphanedBackups.flatMap((b) =>
        b.json_key ? [b.file_key, b.json_key] : [b.file_key],
      );
      await Promise.allSettled(r2Keys.map((key) => deleteFromR2(key)));
      await executeD1Query("DELETE FROM backups WHERE project_id = ?", [id]);
      console.log(
        `  🧹 Cleaned ${orphanedBackups.length} orphaned backups (${r2Keys.length} R2 keys)`,
      );
    }

    const existing = await executeD1Query<{
      name: string;
      webhook_token: string;
      description: string | null;
      allowed_ips: string | null;
      category_id: string | null;
      auto_backup_enabled: number;
      auto_backup_interval: number;
      auto_backup_webhook: string | null;
      auto_backup_header_key: string | null;
      auto_backup_header_value: string | null;
    }>(
      `SELECT name, webhook_token, description, allowed_ips, category_id,
              auto_backup_enabled, auto_backup_interval, auto_backup_webhook,
              auto_backup_header_key, auto_backup_header_value
       FROM projects WHERE id = ?`,
      [id],
    );

    if (existing.length === 0) {
      await executeD1Query(
        `INSERT INTO projects (id, name, description, webhook_token, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [id, name, description, webhookToken],
      );
      return json(200, {
        action: "created",
        projectId: id,
        webhookToken,
        cleanedBackups: orphanedBackups.length,
      });
    }

    const row = existing[0];
    if (!row) {
      return json(500, {
        error: "Unexpected: empty result after length check",
      });
    }
    const isClean =
      row.name === name &&
      row.description === description &&
      row.webhook_token === webhookToken &&
      row.allowed_ips === null &&
      row.category_id === null &&
      row.auto_backup_enabled === 0 &&
      row.auto_backup_interval === 24 &&
      row.auto_backup_webhook === null &&
      row.auto_backup_header_key === null &&
      row.auto_backup_header_value === null;

    if (isClean) {
      return json(200, {
        action: "verified",
        projectId: id,
        webhookToken,
        cleanedBackups: orphanedBackups.length,
      });
    }

    await executeD1Query(
      `UPDATE projects SET
         name = ?, webhook_token = ?, description = ?,
         allowed_ips = NULL, category_id = NULL,
         auto_backup_enabled = 0, auto_backup_interval = 24,
         auto_backup_webhook = NULL, auto_backup_header_key = NULL,
         auto_backup_header_value = NULL,
         updated_at = datetime('now')
       WHERE id = ?`,
      [name, webhookToken, description, id],
    );
    return json(200, {
      action: "reset",
      projectId: id,
      webhookToken,
      cleanedBackups: orphanedBackups.length,
    });
  } catch (error) {
    console.error("Seed test project failed:", error);
    return json(500, { error: String(error) });
  }
}
