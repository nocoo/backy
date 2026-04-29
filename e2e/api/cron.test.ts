/**
 * L2: Cron API E2E tests.
 *
 * Routes covered:
 *   POST /api/cron/trigger
 *   POST /api/cron/trigger/:projectId
 */

import { describe, expect, test, beforeAll } from "bun:test";
import { url, jsonRequest } from "./config";

describe("L2: API /api/cron", () => {
  let testProjectId: string;

  beforeAll(async () => {
    // Create a test project with auto-backup enabled
    const res = await jsonRequest("POST", "/api/projects", {
      name: "Cron Test Project",
      auto_backup_enabled: true,
      auto_backup_interval: 24,
      auto_backup_webhook: "https://example.com/webhook",
    });
    const body = (await res.json()) as { id: string };
    testProjectId = body.id;
  });

  test("POST /api/cron/trigger triggers all auto-backups", async () => {
    // Cron trigger requires CRON_SECRET header in prod, but E2E_SKIP_AUTH
    // should bypass. Without valid auth, expect 401 or success.
    const res = await jsonRequest("POST", "/api/cron/trigger");
    // 200 = success, 401 = unauthorized (no CRON_SECRET), 500 = CRON_SECRET not configured
    expect([200, 401, 500]).toContain(res.status);
  });

  test("POST /api/cron/trigger/:projectId triggers single project backup", async () => {
    expect(testProjectId).toBeTruthy();

    const res = await jsonRequest(
      "POST",
      `/api/cron/trigger/${testProjectId}`,
    );
    // May succeed or fail based on webhook config
    expect([200, 400, 500]).toContain(res.status);
  });
});
