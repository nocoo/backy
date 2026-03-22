/**
 * POST /api/db/seed-test-project — Ensure the E2E test project exists
 * in a known baseline state: correct name, token, and all optional
 * fields reset to defaults.
 *
 * ONLY available when E2E_SKIP_AUTH=true (test servers).
 * Returns 403 in production.
 *
 * Does NOT accept any user input — all values come from the shared
 * TEST_PROJECT constant in src/lib/test-project.ts.
 *
 * Three outcomes:
 * - "created": project did not exist, inserted with baseline values
 * - "verified": project exists and all fields match baseline
 * - "reset": project exists but one or more fields were dirty, fully reset
 *
 * Additionally, deletes ALL backups (D1 rows + R2 objects) belonging to
 * the test project. This prevents orphaned data from prior crashed runs
 * from polluting the current test run.
 */
import { NextResponse } from "next/server";
import { executeD1Query } from "@/lib/db/d1-client";
import { deleteFromR2 } from "@/lib/r2/client";
import { TEST_PROJECT } from "@/lib/test-project";

export async function POST() {
  if (process.env.E2E_SKIP_AUTH !== "true") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, name, webhookToken, description } = TEST_PROJECT;

  try {
    // --- Pre-run cleanup: remove orphaned backups from prior crashed runs ---
    const orphanedBackups = await executeD1Query<{
      id: string;
      file_key: string;
      json_key: string | null;
    }>(
      "SELECT id, file_key, json_key FROM backups WHERE project_id = ?",
      [id],
    );
    if (orphanedBackups.length > 0) {
      // Delete R2 objects first (best-effort — R2 may already be clean)
      const r2Keys = orphanedBackups.flatMap((b) =>
        b.json_key ? [b.file_key, b.json_key] : [b.file_key],
      );
      await Promise.allSettled(r2Keys.map((key) => deleteFromR2(key)));
      // Delete D1 rows
      await executeD1Query("DELETE FROM backups WHERE project_id = ?", [id]);
      console.log(
        `  🧹 Cleaned ${orphanedBackups.length} orphaned backups (${r2Keys.length} R2 keys)`,
      );
    }

    // Check current state
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
      // Create with all defaults
      await executeD1Query(
        `INSERT INTO projects (id, name, description, webhook_token, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [id, name, description, webhookToken],
      );
      return NextResponse.json({
        action: "created",
        projectId: id,
        webhookToken,
        cleanedBackups: orphanedBackups.length,
      });
    }

    // Check if ALL fields match baseline
    // Safe to assert — we already checked existing.length > 0 above
    const row = existing[0]!;
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
      return NextResponse.json({
        action: "verified",
        projectId: id,
        webhookToken,
        cleanedBackups: orphanedBackups.length,
      });
    }

    // One or more fields dirty — full reset to baseline
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
    return NextResponse.json({
      action: "reset",
      projectId: id,
      webhookToken,
      cleanedBackups: orphanedBackups.length,
    });
  } catch (error) {
    console.error("Seed test project failed:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
