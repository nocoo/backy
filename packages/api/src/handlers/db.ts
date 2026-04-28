import { initializeSchema } from "../lib/db/schema";
import { TEST_PROJECT } from "../lib/test-project";
import { json, type HandlerResponse } from "../http/response";
import type { RuntimeContext } from "../runtime";

export async function dbInitHandler(
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  try {
    await initializeSchema(ctx.db);
    return json(200, { ok: true, message: "Schema initialized" });
  } catch (error) {
    console.error("Schema initialization failed:", error);
    return json(500, { error: "Schema initialization failed" });
  }
}

export async function getTestMarkerHandler(
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  try {
    const { results } = await ctx.db.query<{ id: string }>(
      "SELECT id FROM _test_marker LIMIT 1",
    );
    return json(200, { marker: results[0]?.id ?? null });
  } catch (error) {
    return json(200, {
      marker: null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function seedTestProjectHandler(
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  if (ctx.env.E2E_SKIP_AUTH !== "true") {
    return json(403, { error: "Forbidden" });
  }

  const { id, name, webhookToken, description } = TEST_PROJECT;

  try {
    const { results: orphanedBackups } = await ctx.db.query<{
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
      await Promise.allSettled(r2Keys.map((key) => ctx.r2.delete(key)));
      await ctx.db.query("DELETE FROM backups WHERE project_id = ?", [id]);
      console.log(
        `  🧹 Cleaned ${orphanedBackups.length} orphaned backups (${r2Keys.length} R2 keys)`,
      );
    }

    const { results: existing } = await ctx.db.query<{
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
      await ctx.db.query(
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

    await ctx.db.query(
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
