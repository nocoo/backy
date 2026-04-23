/**
 * Suite: Webhook GET Status — GET /api/webhook/:id returns project status
 */

import { test, assert, assertEqual } from "../framework";
import { WEBHOOK_TOKEN } from "../config";
import { webhookUrl } from "../helpers";

export async function suiteWebhookGetStatus(): Promise<void> {
  console.log("\n📋 Suite: Webhook GET Status");

  // Uses the backy-test project which has backups from previous suites

  await test("GIVEN existing backups WHEN querying GET /api/webhook/:id with valid token THEN returns status", async () => {
    const res = await fetch(webhookUrl(), {
      headers: { Authorization: `Bearer ${WEBHOOK_TOKEN}` },
    });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.project_name, "backy-test", "project_name");
    assert(typeof body.total_backups === "number" && body.total_backups > 0, "total_backups should be > 0");
    assert(Array.isArray(body.recent_backups), "recent_backups should be an array");
    assert(body.recent_backups.length > 0 && body.recent_backups.length <= 5, "recent_backups should have 1-5 items");
    // Verify recent backup structure
    const recent = body.recent_backups[0];
    assert(typeof recent.id === "string", "backup id");
    assert(typeof recent.file_size === "number", "file_size");
    assert(typeof recent.created_at === "string", "created_at");
  });

  await test("GIVEN existing backups WHEN querying with environment filter THEN filters correctly", async () => {
    const res = await fetch(`${webhookUrl()}?environment=test`, {
      headers: { Authorization: `Bearer ${WEBHOOK_TOKEN}` },
    });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.environment, "test", "environment filter should be reflected");
    // All recent backups should be 'test' environment if filter works
    for (const b of body.recent_backups) {
      assertEqual(b.environment, "test", `backup ${b.id} environment`);
    }
  });

  await test("GIVEN no auth WHEN querying GET webhook THEN returns 401", async () => {
    const res = await fetch(webhookUrl());
    assertEqual(res.status, 401, "status");
  });

  await test("GIVEN wrong token WHEN querying GET webhook THEN returns 403", async () => {
    const res = await fetch(webhookUrl(), {
      headers: { Authorization: "Bearer wrong-token-12345" },
    });
    assertEqual(res.status, 403, "status");
  });
}
