/**
 * Suite: Webhook Logs — verifies /api/logs endpoint with filters
 */

import { test, assert, assertEqual } from "../framework";
import { state, PROJECT_ID } from "../config";

export async function suiteWebhookLogs(): Promise<void> {
  console.log("\n📋 Suite: Webhook Logs");

  // The previous suites (happy path + error paths) should have generated logs.
  // Verify that the /api/logs endpoint returns them.

  await test("GIVEN previous webhook activity WHEN listing logs THEN returns non-empty paginated results", async () => {
    const res = await fetch(`${state.baseUrl}/api/logs`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(typeof body.total === "number", "total should be a number");
    assert(body.total > 0, "total should be > 0 after webhook activity");
    assert(Array.isArray(body.items), "items should be an array");
    assert(body.items.length > 0, "items should not be empty");
    assertEqual(body.page, 1, "page");
    assertEqual(body.pageSize, 50, "pageSize");
  });

  await test("GIVEN webhook logs exist WHEN filtering by method=POST THEN returns only POST logs", async () => {
    const res = await fetch(`${state.baseUrl}/api/logs?method=POST`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(body.items.length > 0, "should have POST logs");
    for (const log of body.items) {
      assertEqual(log.method, "POST", `log ${log.id} method`);
    }
  });

  await test("GIVEN webhook logs exist WHEN filtering by success=true THEN returns only successful logs", async () => {
    const res = await fetch(`${state.baseUrl}/api/logs?success=true`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    for (const log of body.items) {
      assert(log.status_code < 400, `log ${log.id} status ${log.status_code} should be < 400`);
    }
  });

  await test("GIVEN webhook logs exist WHEN filtering by success=false THEN returns only failed logs", async () => {
    const res = await fetch(`${state.baseUrl}/api/logs?success=false`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    for (const log of body.items) {
      assert(log.status_code >= 400, `log ${log.id} status ${log.status_code} should be >= 400`);
    }
  });

  await test("GIVEN webhook logs exist WHEN a log entry is present THEN it has required audit fields", async () => {
    const res = await fetch(`${state.baseUrl}/api/logs?method=POST&success=true&pageSize=1`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(body.items.length > 0, "should have at least one successful POST log");
    const log = body.items[0];
    assert(typeof log.id === "string" && log.id.length > 0, "id");
    assert(typeof log.method === "string", "method");
    assert(typeof log.path === "string", "path");
    assert(typeof log.status_code === "number", "status_code");
    assert(typeof log.created_at === "string", "created_at");
    assert(log.duration_ms === null || typeof log.duration_ms === "number", "duration_ms");
    // error_code should be null for successful requests
    assertEqual(log.error_code, null, "error_code for success");
  });

  await test("GIVEN webhook logs WHEN filtering by projectId THEN returns only logs for that project", async () => {
    const res = await fetch(`${state.baseUrl}/api/logs?projectId=${PROJECT_ID}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(body.items.length > 0, "should have logs for the test project");
    for (const log of body.items) {
      assertEqual(log.project_id, PROJECT_ID, `log ${log.id} project_id`);
    }
  });
}
