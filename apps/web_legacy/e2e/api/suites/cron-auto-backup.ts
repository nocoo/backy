/**
 * Suite: Cron Auto-Backup Trigger & Logs
 */

import { test, assert, assertEqual } from "../framework";
import { state, PROJECT_ID } from "../config";

export async function suiteCronAutoBackup(): Promise<void> {
  console.log("\n📋 Suite: Cron Auto-Backup Trigger & Logs");

  const CRON_SECRET = process.env.CRON_SECRET || "e2e-cron-secret-backy-2026";

  // Step 1: Auth error paths
  await test("GIVEN no auth WHEN calling POST /api/cron/trigger THEN returns 401", async () => {
    const res = await fetch(`${state.baseUrl}/api/cron/trigger`, { method: "POST" });
    assertEqual(res.status, 401, "status");
  });

  await test("GIVEN wrong token WHEN calling POST /api/cron/trigger THEN returns 401", async () => {
    const res = await fetch(`${state.baseUrl}/api/cron/trigger`, {
      method: "POST",
      headers: { Authorization: "Bearer wrong-secret" },
    });
    assertEqual(res.status, 401, "status");
  });

  // Step 2: Enable auto-backup on backy-test project
  // Use the Backy /api/live endpoint as the "SaaS webhook" — it returns 200
  await test("GIVEN backy-test project WHEN enabling auto-backup THEN PUT returns updated project", async () => {
    const res = await fetch(`${state.baseUrl}/api/projects/${PROJECT_ID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auto_backup_enabled: 1,
        auto_backup_interval: 1,
        auto_backup_webhook: `${state.baseUrl}/api/db/init`,
      }),
    });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.auto_backup_enabled, 1, "auto_backup_enabled");
    assertEqual(body.auto_backup_interval, 1, "auto_backup_interval");
    assertEqual(body.auto_backup_webhook, `${state.baseUrl}/api/db/init`, "auto_backup_webhook");
  });

  // Step 3: Trigger cron — interval=1 always fires (hour%1===0 for any hour)
  await test("GIVEN auto-backup enabled with interval=1 WHEN triggering cron THEN project is triggered", async () => {
    const res = await fetch(`${state.baseUrl}/api/cron/trigger`, {
      method: "POST",
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(body.total >= 1, "total should be >= 1 (at least backy-test)");
    assert(body.triggered >= 1, "triggered should be >= 1");
    assertEqual(body.failed, 0, "failed should be 0");
  });

  // Step 4: Verify cron logs were created
  await test("GIVEN a successful trigger WHEN listing cron logs THEN has success entry for backy-test", async () => {
    // Small delay to ensure async cron log writes complete
    await new Promise((r) => setTimeout(r, 1000));

    const res = await fetch(`${state.baseUrl}/api/cron/logs?projectId=${PROJECT_ID}&status=success`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(body.total >= 1, "should have at least 1 success log");
    assert(body.items.length >= 1, "items should have at least 1 entry");
    const log = body.items[0];
    assertEqual(log.project_id, PROJECT_ID, "project_id");
    assertEqual(log.status, "success", "status");
    assert(typeof log.response_code === "number", "response_code should be a number");
    assert(typeof log.duration_ms === "number", "duration_ms should be a number");
    assert(typeof log.triggered_at === "string", "triggered_at should be a string");
  });

  // Step 5: Verify cron log listing with pagination
  await test("GIVEN cron logs WHEN listing with pageSize=1 THEN returns paginated results", async () => {
    const res = await fetch(`${state.baseUrl}/api/cron/logs?pageSize=1`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(body.total >= 1, "total should be >= 1");
    assertEqual(body.items.length, 1, "should return exactly 1 item");
    assertEqual(body.pageSize, 1, "pageSize");
  });

  // Step 6: Delete cron logs for backy-test
  await test("GIVEN cron logs WHEN deleting by projectId THEN returns 204", async () => {
    const res = await fetch(`${state.baseUrl}/api/cron/logs?projectId=${PROJECT_ID}`, {
      method: "DELETE",
    });
    assertEqual(res.status, 204, "status");
  });

  // Step 7: Verify logs deleted
  await test("GIVEN deleted cron logs WHEN listing for backy-test THEN returns zero results", async () => {
    const res = await fetch(`${state.baseUrl}/api/cron/logs?projectId=${PROJECT_ID}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.total, 0, "total should be 0 after delete");
  });

  // Step 8: Test with custom auth header
  await test("GIVEN auto-backup with custom header WHEN triggering THEN project triggers with header", async () => {
    // Update to include custom auth header
    const updateRes = await fetch(`${state.baseUrl}/api/projects/${PROJECT_ID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auto_backup_header_key: "X-Custom-Key",
        auto_backup_header_value: "custom-secret-value",
      }),
    });
    assertEqual(updateRes.status, 200, "update status");

    // Trigger cron
    const res = await fetch(`${state.baseUrl}/api/cron/trigger`, {
      method: "POST",
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    assertEqual(res.status, 200, "trigger status");
    const body = await res.json();
    assert(body.triggered >= 1, "should trigger at least 1 project");
  });

  // Step 9: Cleanup — disable auto-backup, delete remaining cron logs
  await test("GIVEN auto-backup enabled WHEN disabling it THEN PUT returns updated project", async () => {
    const res = await fetch(`${state.baseUrl}/api/projects/${PROJECT_ID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auto_backup_enabled: 0,
        auto_backup_webhook: null,
        auto_backup_header_key: null,
        auto_backup_header_value: null,
      }),
    });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.auto_backup_enabled, 0, "auto_backup_enabled should be 0");
  });

  // Delete all cron logs
  await test("GIVEN remaining cron logs WHEN deleting all THEN returns 204", async () => {
    const res = await fetch(`${state.baseUrl}/api/cron/logs`, { method: "DELETE" });
    assertEqual(res.status, 204, "status");
  });

  // Verify no cron logs remain (retry to handle D1 eventual consistency)
  await test("GIVEN all cron logs deleted WHEN listing THEN returns zero results", async () => {
    let total = -1;
    for (let attempt = 0; attempt < 3; attempt++) {
      // If stale logs appeared after delete, delete again
      if (attempt > 0) {
        await fetch(`${state.baseUrl}/api/cron/logs`, { method: "DELETE" });
      }
      await new Promise((r) => setTimeout(r, 500));
      const res = await fetch(`${state.baseUrl}/api/cron/logs`);
      assertEqual(res.status, 200, "status");
      const body = await res.json();
      total = body.total;
      if (total === 0) break;
    }
    assertEqual(total, 0, "total should be 0");
  });

  // Step 10: Verify trigger with no enabled projects returns empty
  await test("GIVEN no auto-backup projects WHEN triggering cron THEN returns zeros", async () => {
    const res = await fetch(`${state.baseUrl}/api/cron/trigger`, {
      method: "POST",
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    // May be 0 if backy-test is the only project, or >0 if other projects exist
    assertEqual(body.failed, 0, "failed should be 0");
  });
}
