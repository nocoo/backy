/**
 * E2E tests for Backy — BDD style, self-bootstrapping with backy-test project.
 *
 * Uses the real backy-test project in D1/R2 via the local dev server
 * (E2E_SKIP_AUTH=true bypasses OAuth for protected routes).
 *
 * Flow:
 *   1. Happy path — JSON backup: upload → query → preview → download → restore → content compare
 *   2. Happy path — ZIP backup: upload → extract → preview → download → restore → content compare
 *   3. Error paths — invalid auth, empty file, bad environment, 404s
 *   4. Cleanup — delete all test backups, verify deletion
 */

import JSZip from "jszip";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PROJECT_ID = "mnp039joh6yiala5UY0Hh";
const WEBHOOK_TOKEN = "wDzglaK3i-tTUmHsTsCdTWQVTeZWSn9tGfCaW4lR1f3JPGzJ";
const E2E_TAG_PREFIX = "e2e-test-";

// Test data — a known JSON object to round-trip
const TEST_JSON_DATA = {
  _e2e: true,
  timestamp: new Date().toISOString(),
  settings: {
    theme: "dark",
    language: "en",
    notifications: { email: true, push: false },
  },
  items: [
    { id: 1, name: "Alpha", active: true },
    { id: 2, name: "Beta", active: false },
    { id: 3, name: "Gamma", active: true },
  ],
};

// ---------------------------------------------------------------------------
// Test framework (minimal BDD)
// ---------------------------------------------------------------------------

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];
let baseUrl = "";

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = performance.now();
  try {
    await fn();
    const duration = performance.now() - start;
    results.push({ name, passed: true, duration });
    console.log(`  ✅ ${name} (${duration.toFixed(0)}ms)`);
  } catch (err) {
    const duration = performance.now() - start;
    const error = err instanceof Error ? err.message : String(err);
    results.push({ name, passed: false, error, duration });
    console.log(`  ❌ ${name} (${duration.toFixed(0)}ms)`);
    console.log(`     ${error}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: deep equality failed`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function webhookUrl(): string {
  return `${baseUrl}/api/webhook/${PROJECT_ID}`;
}

function tag(): string {
  return `${E2E_TAG_PREFIX}${Date.now()}`;
}

async function uploadJsonBackup(
  opts: { token?: string; environment?: string; tag?: string; body?: BodyInit; contentType?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.token !== undefined) {
    headers["Authorization"] = `Bearer ${opts.token}`;
  }

  let body: BodyInit;
  if (opts.body !== undefined) {
    body = opts.body;
    if (opts.contentType) {
      headers["Content-Type"] = opts.contentType;
    }
  } else {
    const formData = new FormData();
    const jsonBlob = new Blob([JSON.stringify(TEST_JSON_DATA)], { type: "application/json" });
    formData.append("file", new File([jsonBlob], "backup.json", { type: "application/json" }));
    if (opts.environment) formData.append("environment", opts.environment);
    if (opts.tag) formData.append("tag", opts.tag);
    body = formData;
    headers["Authorization"] = `Bearer ${WEBHOOK_TOKEN}`;
  }

  return fetch(webhookUrl(), { method: "POST", headers, body });
}

async function createZipWithJson(data: unknown, filename = "data.json"): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(filename, JSON.stringify(data));
  return zip.generateAsync({ type: "uint8array" });
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

// IDs of backups created during the test — cleaned up at the end
const createdBackupIds: string[] = [];

async function suiteHappyPathJson(): Promise<void> {
  console.log("\n📋 Suite: Happy Path — JSON Backup");

  let backupId = "";
  const testTag = tag();

  // Step 1: Upload JSON backup via webhook
  await test("GIVEN a valid JSON file WHEN uploading via webhook THEN returns 201 with backup ID", async () => {
    const res = await uploadJsonBackup({ environment: "test", tag: testTag });
    assertEqual(res.status, 201, "status");
    const body = await res.json();
    assert(typeof body.id === "string" && body.id.length > 0, "backup id should be a non-empty string");
    assertEqual(body.project_id, PROJECT_ID, "project_id");
    assert(body.file_size > 0, "file_size should be positive");
    backupId = body.id;
    createdBackupIds.push(backupId);
  });

  // Step 2: Query the backup via protected API
  await test("GIVEN a created backup WHEN querying by ID THEN returns full backup metadata", async () => {
    const res = await fetch(`${baseUrl}/api/backups/${backupId}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.id, backupId, "id");
    assertEqual(body.project_id, PROJECT_ID, "project_id");
    assertEqual(body.environment, "test", "environment");
    assertEqual(body.tag, testTag, "tag");
    assertEqual(body.is_single_json, 1, "is_single_json");
    assert(body.json_key !== null, "json_key should be set for JSON upload");
    assert(body.project_name === "backy-test", "project_name should be backy-test");
  });

  // Step 3: Preview the JSON content
  await test("GIVEN a JSON backup WHEN requesting preview THEN returns the original JSON content", async () => {
    const res = await fetch(`${baseUrl}/api/backups/${backupId}/preview`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.backup_id, backupId, "backup_id");
    assertDeepEqual(body.content, TEST_JSON_DATA, "content should match original upload");
  });

  // Step 4: Download the backup
  await test("GIVEN a JSON backup WHEN requesting download URL THEN returns presigned URL that serves original content", async () => {
    const res = await fetch(`${baseUrl}/api/backups/${backupId}/download`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(typeof body.url === "string", "url should be a string");
    assert(body.url.includes("http"), "url should be an HTTP URL");
    assert(body.expires_in === 900, "expires_in should be 900 seconds");

    // Actually download and compare content
    const downloadRes = await fetch(body.url);
    assertEqual(downloadRes.status, 200, "download status");
    const downloaded = await downloadRes.json();
    assertDeepEqual(downloaded, TEST_JSON_DATA, "downloaded content should match original");
  });

  // Step 5: Restore endpoint (public, uses webhook token)
  await test("GIVEN a JSON backup WHEN requesting restore with Bearer token THEN returns presigned URL", async () => {
    const res = await fetch(`${baseUrl}/api/restore/${backupId}`, {
      headers: { Authorization: `Bearer ${WEBHOOK_TOKEN}` },
    });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(typeof body.url === "string", "url should be a string");
    assertEqual(body.backup_id, backupId, "backup_id");
    assertEqual(body.expires_in, 900, "expires_in");

    // Download via restore URL and verify content
    const restoreRes = await fetch(body.url);
    assertEqual(restoreRes.status, 200, "restore download status");
    const restored = await restoreRes.json();
    assertDeepEqual(restored, TEST_JSON_DATA, "restored content should match original");
  });

  // Step 5b: Restore with query param token
  await test("GIVEN a JSON backup WHEN requesting restore with ?token= query param THEN returns presigned URL", async () => {
    const res = await fetch(`${baseUrl}/api/restore/${backupId}?token=${WEBHOOK_TOKEN}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(typeof body.url === "string", "url");
  });

  // Step 6: Backup appears in list
  await test("GIVEN a created backup WHEN listing backups with search THEN backup appears in results", async () => {
    const res = await fetch(`${baseUrl}/api/backups?search=${testTag}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(body.items.length >= 1, "should have at least 1 result");
    const found = body.items.find((b: { id: string }) => b.id === backupId);
    assert(found !== undefined, "backup should appear in search results");
  });
}

async function suiteHappyPathZip(): Promise<void> {
  console.log("\n📋 Suite: Happy Path — ZIP Backup");

  let backupId = "";
  const testTag = tag();

  // Step 1: Upload ZIP backup
  await test("GIVEN a valid ZIP file containing JSON WHEN uploading via webhook THEN returns 201", async () => {
    const zipData = await createZipWithJson(TEST_JSON_DATA);
    const formData = new FormData();
    formData.append("file", new File([zipData as BlobPart], "backup.zip", { type: "application/zip" }));
    formData.append("environment", "test");
    formData.append("tag", testTag);

    const res = await fetch(webhookUrl(), {
      method: "POST",
      headers: { Authorization: `Bearer ${WEBHOOK_TOKEN}` },
      body: formData,
    });
    assertEqual(res.status, 201, "status");
    const body = await res.json();
    backupId = body.id;
    createdBackupIds.push(backupId);
  });

  // Step 2: Verify it's a zip backup (no json_key yet)
  await test("GIVEN a ZIP backup WHEN querying metadata THEN is_single_json=0 and json_key is null", async () => {
    const res = await fetch(`${baseUrl}/api/backups/${backupId}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.is_single_json, 0, "is_single_json");
    assertEqual(body.json_key, null, "json_key should be null before extraction");
  });

  // Step 3: Preview should fail before extraction
  await test("GIVEN a ZIP backup without extraction WHEN requesting preview THEN returns 404 with hint", async () => {
    const res = await fetch(`${baseUrl}/api/backups/${backupId}/preview`);
    assertEqual(res.status, 404, "status");
    const body = await res.json();
    assert(body.error.includes("Extract"), "error should mention extraction");
  });

  // Step 4: Extract JSON from ZIP
  await test("GIVEN a ZIP backup WHEN extracting JSON THEN succeeds and sets json_key", async () => {
    const res = await fetch(`${baseUrl}/api/backups/${backupId}/extract`, { method: "POST" });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(body.json_key !== undefined, "json_key should be set");
    assert(body.source_file === "data.json", "source_file should be data.json");
    assertEqual(body.json_files_found, 1, "json_files_found");
  });

  // Step 5: Re-extract should be idempotent
  await test("GIVEN an already-extracted backup WHEN extracting again THEN returns existing json_key", async () => {
    const res = await fetch(`${baseUrl}/api/backups/${backupId}/extract`, { method: "POST" });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(body.message.includes("already"), "should indicate already extracted");
  });

  // Step 6: Preview should work after extraction
  await test("GIVEN an extracted ZIP backup WHEN requesting preview THEN returns the JSON content", async () => {
    const res = await fetch(`${baseUrl}/api/backups/${backupId}/preview`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertDeepEqual(body.content, TEST_JSON_DATA, "content should match original data");
  });

  // Step 7: Download the original ZIP and verify it's a valid zip
  await test("GIVEN a ZIP backup WHEN downloading THEN can open and read the JSON inside", async () => {
    const dlRes = await fetch(`${baseUrl}/api/backups/${backupId}/download`);
    const { url } = await dlRes.json();
    const zipRes = await fetch(url);
    assertEqual(zipRes.status, 200, "download status");
    const zipBuffer = await zipRes.arrayBuffer();
    const zip = await JSZip.loadAsync(zipBuffer);
    const jsonFile = zip.file("data.json");
    assert(jsonFile !== null, "zip should contain data.json");
    const text = await jsonFile!.async("text");
    assertDeepEqual(JSON.parse(text), TEST_JSON_DATA, "zip content should match original");
  });

  // Step 8: Restore endpoint
  await test("GIVEN a ZIP backup WHEN restoring via public endpoint THEN returns valid download URL", async () => {
    const res = await fetch(`${baseUrl}/api/restore/${backupId}?token=${WEBHOOK_TOKEN}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(typeof body.url === "string", "url");
    // Download and verify it's a valid zip
    const zipRes = await fetch(body.url);
    assertEqual(zipRes.status, 200, "restore download status");
    const zipBuffer = await zipRes.arrayBuffer();
    const zip = await JSZip.loadAsync(zipBuffer);
    assert(Object.keys(zip.files).length > 0, "restored zip should have files");
  });
}

async function suiteErrorPaths(): Promise<void> {
  console.log("\n📋 Suite: Error Paths");

  // HEAD — API key verification
  await test("GIVEN valid token WHEN sending HEAD to webhook THEN returns 200 with project name header", async () => {
    const res = await fetch(webhookUrl(), {
      method: "HEAD",
      headers: { Authorization: `Bearer ${WEBHOOK_TOKEN}` },
    });
    assertEqual(res.status, 200, "status");
    const projectName = res.headers.get("X-Project-Name");
    assert(projectName === "backy-test", `X-Project-Name should be backy-test, got ${projectName}`);
  });

  await test("GIVEN no Authorization header WHEN sending HEAD to webhook THEN returns 401", async () => {
    const res = await fetch(webhookUrl(), { method: "HEAD" });
    assertEqual(res.status, 401, "status");
  });

  await test("GIVEN wrong token WHEN sending HEAD to webhook THEN returns 403", async () => {
    const res = await fetch(webhookUrl(), {
      method: "HEAD",
      headers: { Authorization: "Bearer wrong-token-12345" },
    });
    assertEqual(res.status, 403, "status");
  });

  await test("GIVEN valid token but wrong project ID WHEN sending HEAD THEN returns 403", async () => {
    const res = await fetch(`${baseUrl}/api/webhook/wrong-project-id`, {
      method: "HEAD",
      headers: { Authorization: `Bearer ${WEBHOOK_TOKEN}` },
    });
    assertEqual(res.status, 403, "status");
  });

  // Auth errors
  await test("GIVEN no Authorization header WHEN uploading THEN returns 401", async () => {
    const formData = new FormData();
    formData.append("file", new File(["test"], "backup.json", { type: "application/json" }));
    const res = await fetch(webhookUrl(), { method: "POST", body: formData });
    assertEqual(res.status, 401, "status");
  });

  await test("GIVEN wrong token WHEN uploading THEN returns 403", async () => {
    const formData = new FormData();
    formData.append("file", new File(["test"], "backup.json", { type: "application/json" }));
    const res = await fetch(webhookUrl(), {
      method: "POST",
      headers: { Authorization: "Bearer wrong-token-12345" },
      body: formData,
    });
    assertEqual(res.status, 403, "status");
  });

  // Empty file
  await test("GIVEN an empty file WHEN uploading THEN returns 400", async () => {
    const formData = new FormData();
    formData.append("file", new File([], "empty.json", { type: "application/json" }));
    const res = await fetch(webhookUrl(), {
      method: "POST",
      headers: { Authorization: `Bearer ${WEBHOOK_TOKEN}` },
      body: formData,
    });
    assertEqual(res.status, 400, "status");
    const body = await res.json();
    assert(body.error.includes("empty"), "error should mention empty");
  });

  // Missing file field
  await test("GIVEN no file field WHEN uploading THEN returns 400", async () => {
    const formData = new FormData();
    const res = await fetch(webhookUrl(), {
      method: "POST",
      headers: { Authorization: `Bearer ${WEBHOOK_TOKEN}` },
      body: formData,
    });
    assertEqual(res.status, 400, "status");
  });

  // Invalid environment
  await test("GIVEN invalid environment value WHEN uploading THEN returns 400", async () => {
    const formData = new FormData();
    formData.append("file", new File(["{}"], "backup.json", { type: "application/json" }));
    formData.append("environment", "invalid-env");
    const res = await fetch(webhookUrl(), {
      method: "POST",
      headers: { Authorization: `Bearer ${WEBHOOK_TOKEN}` },
      body: formData,
    });
    assertEqual(res.status, 400, "status");
    const body = await res.json();
    assert(body.error.toLowerCase().includes("environment"), "error should mention environment");
  });

  // 404 — non-existent backup
  await test("GIVEN a non-existent backup ID WHEN querying THEN returns 404", async () => {
    const res = await fetch(`${baseUrl}/api/backups/nonexistent-id-12345`);
    assertEqual(res.status, 404, "status");
  });

  await test("GIVEN a non-existent backup ID WHEN requesting preview THEN returns 404", async () => {
    const res = await fetch(`${baseUrl}/api/backups/nonexistent-id-12345/preview`);
    assertEqual(res.status, 404, "status");
  });

  await test("GIVEN a non-existent backup ID WHEN requesting download THEN returns 404", async () => {
    const res = await fetch(`${baseUrl}/api/backups/nonexistent-id-12345/download`);
    assertEqual(res.status, 404, "status");
  });

  // Restore error paths
  await test("GIVEN no token WHEN requesting restore THEN returns 401", async () => {
    const res = await fetch(`${baseUrl}/api/restore/some-id`);
    assertEqual(res.status, 401, "status");
  });

  await test("GIVEN wrong token WHEN requesting restore THEN returns 403", async () => {
    // Need a real backup ID first — use first created one
    if (createdBackupIds.length > 0) {
      const res = await fetch(`${baseUrl}/api/restore/${createdBackupIds[0]}?token=wrong-token`);
      assertEqual(res.status, 403, "status");
    }
  });

  await test("GIVEN non-existent backup WHEN requesting restore THEN returns 404", async () => {
    const res = await fetch(`${baseUrl}/api/restore/nonexistent-id?token=${WEBHOOK_TOKEN}`);
    assertEqual(res.status, 404, "status");
  });

  // Project ID mismatch
  await test("GIVEN valid token but wrong project ID WHEN uploading THEN returns 403", async () => {
    const formData = new FormData();
    formData.append("file", new File(["{}"], "backup.json", { type: "application/json" }));
    const res = await fetch(`${baseUrl}/api/webhook/wrong-project-id`, {
      method: "POST",
      headers: { Authorization: `Bearer ${WEBHOOK_TOKEN}` },
      body: formData,
    });
    assertEqual(res.status, 403, "status");
  });
}

async function suiteWebhookLogs(): Promise<void> {
  console.log("\n📋 Suite: Webhook Logs");

  // The previous suites (happy path + error paths) should have generated logs.
  // Verify that the /api/logs endpoint returns them.

  await test("GIVEN previous webhook activity WHEN listing logs THEN returns non-empty paginated results", async () => {
    const res = await fetch(`${baseUrl}/api/logs`);
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
    const res = await fetch(`${baseUrl}/api/logs?method=POST`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(body.items.length > 0, "should have POST logs");
    for (const log of body.items) {
      assertEqual(log.method, "POST", `log ${log.id} method`);
    }
  });

  await test("GIVEN webhook logs exist WHEN filtering by success=true THEN returns only successful logs", async () => {
    const res = await fetch(`${baseUrl}/api/logs?success=true`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    for (const log of body.items) {
      assert(log.status_code < 400, `log ${log.id} status ${log.status_code} should be < 400`);
    }
  });

  await test("GIVEN webhook logs exist WHEN filtering by success=false THEN returns only failed logs", async () => {
    const res = await fetch(`${baseUrl}/api/logs?success=false`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    for (const log of body.items) {
      assert(log.status_code >= 400, `log ${log.id} status ${log.status_code} should be >= 400`);
    }
  });

  await test("GIVEN webhook logs exist WHEN a log entry is present THEN it has required audit fields", async () => {
    const res = await fetch(`${baseUrl}/api/logs?method=POST&success=true&pageSize=1`);
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
    const res = await fetch(`${baseUrl}/api/logs?projectId=${PROJECT_ID}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(body.items.length > 0, "should have logs for the test project");
    for (const log of body.items) {
      assertEqual(log.project_id, PROJECT_ID, `log ${log.id} project_id`);
    }
  });
}

async function suiteHealthCheck(): Promise<void> {
  console.log("\n📋 Suite: Health Check");

  await test("GIVEN a running server WHEN requesting /api/live THEN returns 200 with health status", async () => {
    const res = await fetch(`${baseUrl}/api/live`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.status, "ok", "status field");
    assert(typeof body.version === "string" && body.version.length > 0, "version should be a non-empty string");
    assert(typeof body.timestamp === "string", "timestamp should be a string");
    assert(typeof body.uptime_s === "number" && body.uptime_s >= 0, "uptime_s should be a non-negative number");
    // Verify dependencies
    assert(body.dependencies !== undefined, "dependencies should exist");
    assertEqual(body.dependencies.d1.status, "up", "d1 status");
    assertEqual(body.dependencies.r2.status, "up", "r2 status");
    assert(typeof body.dependencies.d1.latency_ms === "number", "d1 latency_ms should be a number");
    assert(typeof body.dependencies.r2.latency_ms === "number", "r2 latency_ms should be a number");
  });

  await test("GIVEN a running server WHEN requesting /api/live THEN has no-cache headers", async () => {
    const res = await fetch(`${baseUrl}/api/live`);
    assertEqual(res.status, 200, "status");
    const cacheControl = res.headers.get("cache-control");
    assert(cacheControl !== null && cacheControl.includes("no-store"), "should have no-store cache control");
  });
}

async function suiteDashboardStats(): Promise<void> {
  console.log("\n📋 Suite: Dashboard Stats");

  await test("GIVEN existing data WHEN requesting /api/stats THEN returns aggregate statistics", async () => {
    const res = await fetch(`${baseUrl}/api/stats`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(typeof body.totalProjects === "number" && body.totalProjects > 0, "totalProjects should be > 0");
    assert(typeof body.totalBackups === "number" && body.totalBackups >= 0, "totalBackups should be >= 0");
    assert(typeof body.totalStorageBytes === "number" && body.totalStorageBytes >= 0, "totalStorageBytes should be >= 0");
  });

  await test("GIVEN existing data WHEN requesting /api/stats/charts THEN returns chart data", async () => {
    const res = await fetch(`${baseUrl}/api/stats/charts`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(Array.isArray(body.projectStats), "projectStats should be an array");
    assert(Array.isArray(body.dailyBackups), "dailyBackups should be an array");
  });

  await test("GIVEN chart data WHEN inspecting projectStats THEN each entry has expected fields", async () => {
    const res = await fetch(`${baseUrl}/api/stats/charts`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(body.projectStats.length > 0, "projectStats should have entries");
    const entry = body.projectStats[0];
    assert(typeof entry.project_id === "string", "project_id should be a string");
    assert(typeof entry.project_name === "string", "project_name should be a string");
    assert(typeof entry.backup_count === "number", "backup_count should be a number");
    assert(typeof entry.total_size === "number", "total_size should be a number");
  });

  await test("GIVEN chart data WHEN inspecting dailyBackups THEN entries have date and count", async () => {
    const res = await fetch(`${baseUrl}/api/stats/charts`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    // dailyBackups may be empty if no recent backups, but if populated, verify structure
    if (body.dailyBackups.length > 0) {
      const entry = body.dailyBackups[0];
      assert(typeof entry.date === "string", "date should be a string");
      assert(typeof entry.count === "number", "count should be a number");
    }
  });
}

async function suiteProjectCrud(): Promise<void> {
  console.log("\n📋 Suite: Project CRUD Lifecycle");

  let projectId = "";

  // Step 1: Create project
  await test("GIVEN valid project data WHEN creating via POST THEN returns 201 with project object", async () => {
    const res = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "E2E Test Project", description: "Created by E2E tests" }),
    });
    assertEqual(res.status, 201, "status");
    const body = await res.json();
    assert(typeof body.id === "string" && body.id.length > 0, "id should be a non-empty string");
    assertEqual(body.name, "E2E Test Project", "name");
    assertEqual(body.description, "Created by E2E tests", "description");
    assert(typeof body.webhook_token === "string" && body.webhook_token.length > 0, "webhook_token should exist");
    projectId = body.id;
    createdProjectIds.push(projectId);
  });

  // Step 2: List projects
  await test("GIVEN a created project WHEN listing all projects THEN the new project appears", async () => {
    const res = await fetch(`${baseUrl}/api/projects`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(Array.isArray(body), "response should be an array");
    const found = body.find((p: { id: string }) => p.id === projectId);
    assert(found !== undefined, "project should appear in list");
    assertEqual(found.name, "E2E Test Project", "name");
  });

  // Step 3: Get project by ID
  await test("GIVEN a created project WHEN getting by ID THEN returns full project data", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.id, projectId, "id");
    assertEqual(body.name, "E2E Test Project", "name");
    assertEqual(body.description, "Created by E2E tests", "description");
    assert(typeof body.webhook_token === "string", "webhook_token should be a string");
    assertEqual(body.allowed_ips, null, "allowed_ips should be null by default");
    assertEqual(body.category_id, null, "category_id should be null by default");
  });

  // Step 4: Update project name + description
  await test("GIVEN a created project WHEN updating name and description THEN returns updated data", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "E2E Updated Project", description: "Updated description" }),
    });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.name, "E2E Updated Project", "name");
    assertEqual(body.description, "Updated description", "description");
  });

  // Step 5: Verify update persisted
  await test("GIVEN an updated project WHEN getting by ID THEN returns updated values", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.name, "E2E Updated Project", "name");
    assertEqual(body.description, "Updated description", "description");
  });

  // Step 6: Set allowed_ips with valid CIDR
  await test("GIVEN a project WHEN setting allowed_ips with valid CIDR THEN succeeds", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowed_ips: "192.168.1.0/24, 10.0.0.1/32" }),
    });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(body.allowed_ips !== null, "allowed_ips should be set");
    assert(body.allowed_ips.includes("192.168.1.0"), "should contain first CIDR");
    assert(body.allowed_ips.includes("10.0.0.1"), "should contain second CIDR");
  });

  // Step 7: Set allowed_ips with invalid format
  await test("GIVEN a project WHEN setting allowed_ips with invalid format THEN returns 400", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowed_ips: "not-a-valid-cidr" }),
    });
    assertEqual(res.status, 400, "status");
    const body = await res.json();
    assert(body.error.toLowerCase().includes("ip") || body.error.toLowerCase().includes("cidr"), "error should mention IP/CIDR");
  });

  // Step 8: Clear allowed_ips
  await test("GIVEN a project with allowed_ips WHEN clearing with null THEN succeeds", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowed_ips: null }),
    });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.allowed_ips, null, "allowed_ips should be null");
  });

  // Step 9: Get nonexistent project
  await test("GIVEN a nonexistent project ID WHEN getting THEN returns 404", async () => {
    const res = await fetch(`${baseUrl}/api/projects/nonexistent-project-id-xyz`);
    assertEqual(res.status, 404, "status");
  });

  // Step 10: Create project with invalid data (empty name)
  await test("GIVEN invalid project data WHEN creating THEN returns 400", async () => {
    const res = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    assertEqual(res.status, 400, "status");
  });

  // Step 11: Update nonexistent project
  await test("GIVEN a nonexistent project ID WHEN updating THEN returns 404", async () => {
    const res = await fetch(`${baseUrl}/api/projects/nonexistent-project-id-xyz`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Ghost" }),
    });
    assertEqual(res.status, 404, "status");
  });

  // Step 12: Delete nonexistent project
  await test("GIVEN a nonexistent project ID WHEN deleting THEN returns 404", async () => {
    const res = await fetch(`${baseUrl}/api/projects/nonexistent-project-id-xyz`, {
      method: "DELETE",
    });
    assertEqual(res.status, 404, "status");
  });
}

async function suiteTokenRegeneration(): Promise<void> {
  console.log("\n📋 Suite: Token Regeneration");

  // This suite uses the project created by suiteProjectCrud
  assert(createdProjectIds.length > 0, "suiteProjectCrud must run first");
  const projectId = createdProjectIds[0]!;

  // Step 1: Get current token
  let oldToken = "";
  await test("GIVEN a project WHEN getting it THEN has a webhook_token", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(typeof body.webhook_token === "string" && body.webhook_token.length > 0, "webhook_token should exist");
    oldToken = body.webhook_token;
  });

  // Step 2: Regenerate token
  let newToken = "";
  await test("GIVEN a project WHEN regenerating token THEN returns new token different from old", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/token`, { method: "POST" });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(typeof body.webhook_token === "string" && body.webhook_token.length > 0, "new webhook_token should exist");
    assert(body.webhook_token !== oldToken, "new token should differ from old token");
    newToken = body.webhook_token;
  });

  // Step 3: Verify old token fails on HEAD
  await test("GIVEN a regenerated token WHEN using old token on HEAD THEN returns 403", async () => {
    const res = await fetch(`${baseUrl}/api/webhook/${projectId}`, {
      method: "HEAD",
      headers: { Authorization: `Bearer ${oldToken}` },
    });
    assertEqual(res.status, 403, "status");
  });

  // Step 4: Verify new token works on HEAD
  await test("GIVEN a regenerated token WHEN using new token on HEAD THEN returns 200", async () => {
    const res = await fetch(`${baseUrl}/api/webhook/${projectId}`, {
      method: "HEAD",
      headers: { Authorization: `Bearer ${newToken}` },
    });
    assertEqual(res.status, 200, "status");
  });

  // Step 5: Regenerate token for nonexistent project
  await test("GIVEN a nonexistent project WHEN regenerating token THEN returns 404", async () => {
    const res = await fetch(`${baseUrl}/api/projects/nonexistent-project-id-xyz/token`, { method: "POST" });
    assertEqual(res.status, 404, "status");
  });
}

async function suiteWebhookGetStatus(): Promise<void> {
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

async function suiteBackupListAdvanced(): Promise<void> {
  console.log("\n📋 Suite: Backup List Advanced Filters");

  // Uses backups created by happy path suites

  await test("GIVEN backups WHEN listing with projectId filter THEN returns only matching backups", async () => {
    const res = await fetch(`${baseUrl}/api/backups?projectId=${PROJECT_ID}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(body.items.length > 0, "should have backups for backy-test");
    for (const b of body.items) {
      assertEqual(b.project_id, PROJECT_ID, `backup ${b.id} project_id`);
    }
  });

  await test("GIVEN backups WHEN listing with environment filter THEN returns only matching environment", async () => {
    const res = await fetch(`${baseUrl}/api/backups?environment=test`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    for (const b of body.items) {
      assertEqual(b.environment, "test", `backup ${b.id} environment`);
    }
  });

  await test("GIVEN backups WHEN listing with sortBy=file_size&sortOrder=asc THEN returns sorted results", async () => {
    const res = await fetch(`${baseUrl}/api/backups?sortBy=file_size&sortOrder=asc&projectId=${PROJECT_ID}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    if (body.items.length > 1) {
      for (let i = 1; i < body.items.length; i++) {
        assert(body.items[i].file_size >= body.items[i - 1].file_size,
          `item ${i} file_size ${body.items[i].file_size} should be >= item ${i - 1} file_size ${body.items[i - 1].file_size}`);
      }
    }
  });

  await test("GIVEN backups WHEN listing with page=1&pageSize=1 THEN returns exactly 1 item", async () => {
    const res = await fetch(`${baseUrl}/api/backups?page=1&pageSize=1`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.items.length, 1, "should return exactly 1 item");
    assertEqual(body.page, 1, "page");
    assertEqual(body.pageSize, 1, "pageSize");
    assert(body.total > 0, "total should be > 0");
    assert(body.totalPages >= 1, "totalPages should be >= 1");
  });

  await test("GIVEN backups WHEN listing with very high page number THEN returns empty items", async () => {
    const res = await fetch(`${baseUrl}/api/backups?page=9999&pageSize=20`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.items.length, 0, "should return 0 items for out-of-range page");
    assert(body.total >= 0, "total should still be returned");
  });

  await test("GIVEN backups WHEN listing THEN response includes environments and projects arrays", async () => {
    const res = await fetch(`${baseUrl}/api/backups`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(Array.isArray(body.environments), "environments should be an array");
    assert(Array.isArray(body.projects), "projects should be an array");
    assert(body.projects.length > 0, "projects should have entries");
    // Verify project option structure
    const proj = body.projects[0];
    assert(typeof proj.id === "string", "project option should have id");
    assert(typeof proj.name === "string", "project option should have name");
  });
}

async function suiteSingleBackupDelete(): Promise<void> {
  console.log("\n📋 Suite: Single Backup Delete");

  let backupId = "";

  // Step 1: Create a backup to delete
  await test("GIVEN a new backup WHEN uploading via webhook THEN returns 201", async () => {
    const res = await uploadJsonBackup({ environment: "test", tag: `${E2E_TAG_PREFIX}delete-test` });
    assertEqual(res.status, 201, "status");
    const body = await res.json();
    backupId = body.id;
    // Do NOT add to createdBackupIds — we will delete it manually
  });

  // Step 2: Delete via individual endpoint
  await test("GIVEN a backup WHEN deleting via DELETE /api/backups/:id THEN returns success", async () => {
    const res = await fetch(`${baseUrl}/api/backups/${backupId}`, { method: "DELETE" });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.success, true, "success");
  });

  // Step 3: Verify deletion
  await test("GIVEN a deleted backup WHEN getting by ID THEN returns 404", async () => {
    const res = await fetch(`${baseUrl}/api/backups/${backupId}`);
    assertEqual(res.status, 404, "status");
  });

  // Step 4: Delete nonexistent backup
  await test("GIVEN a nonexistent backup WHEN deleting THEN returns 404", async () => {
    const res = await fetch(`${baseUrl}/api/backups/nonexistent-backup-id-xyz`, { method: "DELETE" });
    assertEqual(res.status, 404, "status");
  });
}

async function suitePromptGeneration(): Promise<void> {
  console.log("\n📋 Suite: Prompt Generation");

  await test("GIVEN a valid project WHEN requesting prompt THEN returns 200 with prompt text", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}/prompt`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(typeof body.prompt === "string" && body.prompt.length > 0, "prompt should be a non-empty string");
    // Verify prompt contains key elements
    assert(body.prompt.includes("backy-test"), "prompt should contain project name");
    assert(body.prompt.includes(PROJECT_ID), "prompt should contain project ID");
    assert(body.prompt.includes(WEBHOOK_TOKEN), "prompt should contain webhook token");
  });

  await test("GIVEN a valid project WHEN inspecting prompt THEN contains all 4 sections", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}/prompt`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(body.prompt.includes("Verify API Key"), "prompt should have Verify section");
    assert(body.prompt.includes("Query Backup Status"), "prompt should have Query section");
    assert(body.prompt.includes("Send a Backup"), "prompt should have Send section");
    assert(body.prompt.includes("Restore a Backup"), "prompt should have Restore section");
  });

  await test("GIVEN a nonexistent project WHEN requesting prompt THEN returns 404", async () => {
    const res = await fetch(`${baseUrl}/api/projects/nonexistent-project-id-xyz/prompt`);
    assertEqual(res.status, 404, "status");
  });
}

async function suiteLogDeletion(): Promise<void> {
  console.log("\n📋 Suite: Log Deletion");

  // First verify we have HEAD logs to delete
  await test("GIVEN HEAD webhook logs WHEN deleting by method=HEAD THEN returns success", async () => {
    // Verify HEAD logs exist first
    const checkRes = await fetch(`${baseUrl}/api/logs?method=HEAD&pageSize=1`);
    const checkBody = await checkRes.json();
    assert(checkBody.total > 0, "should have HEAD logs to delete");

    const res = await fetch(`${baseUrl}/api/logs`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "HEAD" }),
    });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.success, true, "success");
  });

  await test("GIVEN deleted HEAD logs WHEN listing by method=HEAD THEN returns zero results", async () => {
    const res = await fetch(`${baseUrl}/api/logs?method=HEAD`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.total, 0, "HEAD logs should be deleted");
    assertEqual(body.items.length, 0, "items should be empty");
  });

  await test("GIVEN remaining logs WHEN deleting with no filters THEN deletes all", async () => {
    // Delete all remaining logs
    const res = await fetch(`${baseUrl}/api/logs`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.success, true, "success");

    // Verify all are gone
    const checkRes = await fetch(`${baseUrl}/api/logs`);
    const checkBody = await checkRes.json();
    assertEqual(checkBody.total, 0, "all logs should be deleted");
  });
}

async function suiteProjectCascadeDelete(): Promise<void> {
  console.log("\n📋 Suite: Project Cascade Delete");

  // Uses the project created by suiteProjectCrud (createdProjectIds[0])
  assert(createdProjectIds.length > 0, "suiteProjectCrud must run first");
  const projectId = createdProjectIds[0]!;

  // Get the project's token for uploading
  let projectToken = "";
  await test("GIVEN a test project WHEN getting it THEN retrieve its token", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    projectToken = body.webhook_token;
    assert(projectToken.length > 0, "token should exist");
  });

  // Upload 2 backups to this project
  const cascadeBackupIds: string[] = [];
  await test("GIVEN a test project WHEN uploading 2 backups THEN both succeed", async () => {
    for (let i = 0; i < 2; i++) {
      const formData = new FormData();
      const jsonBlob = new Blob([JSON.stringify({ cascade_test: i })], { type: "application/json" });
      formData.append("file", new File([jsonBlob], `cascade-${i}.json`, { type: "application/json" }));
      formData.append("environment", "test");
      formData.append("tag", `${E2E_TAG_PREFIX}cascade-${i}`);

      const res = await fetch(`${baseUrl}/api/webhook/${projectId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${projectToken}` },
        body: formData,
      });
      assertEqual(res.status, 201, `upload ${i} status`);
      const body = await res.json();
      cascadeBackupIds.push(body.id);
    }
    assertEqual(cascadeBackupIds.length, 2, "should have 2 backup IDs");
  });

  // Verify backups exist
  await test("GIVEN uploaded backups WHEN querying THEN both exist", async () => {
    for (const id of cascadeBackupIds) {
      const res = await fetch(`${baseUrl}/api/backups/${id}`);
      assertEqual(res.status, 200, `backup ${id} should exist`);
    }
  });

  // Delete the project
  await test("GIVEN a project with backups WHEN deleting the project THEN returns success", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}`, { method: "DELETE" });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.success, true, "success");
    // Remove from cleanup list
    const idx = createdProjectIds.indexOf(projectId);
    if (idx !== -1) createdProjectIds.splice(idx, 1);
  });

  // Verify project is gone
  await test("GIVEN a deleted project WHEN getting by ID THEN returns 404", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}`);
    assertEqual(res.status, 404, "status");
  });

  // Verify backups are gone (CASCADE DELETE)
  await test("GIVEN a deleted project WHEN querying its backups THEN all return 404", async () => {
    for (const id of cascadeBackupIds) {
      const res = await fetch(`${baseUrl}/api/backups/${id}`);
      assertEqual(res.status, 404, `backup ${id} should be 404 after project delete`);
    }
  });
}

async function suiteCleanup(): Promise<void> {
  console.log("\n📋 Suite: Cleanup");

  // Clean up any remaining categories
  if (createdCategoryIds.length > 0) {
    await test(`GIVEN ${createdCategoryIds.length} test categories WHEN deleting THEN all are removed`, async () => {
      for (const id of createdCategoryIds) {
        const res = await fetch(`${baseUrl}/api/categories/${id}`, { method: "DELETE" });
        assert(res.status === 200 || res.status === 404, `category ${id} delete should return 200 or 404`);
      }
    });
  }

  // Clean up any remaining projects (not deleted by cascade suite)
  if (createdProjectIds.length > 0) {
    await test(`GIVEN ${createdProjectIds.length} test projects WHEN deleting THEN all are removed`, async () => {
      for (const id of createdProjectIds) {
        const res = await fetch(`${baseUrl}/api/projects/${id}`, { method: "DELETE" });
        assert(res.status === 200 || res.status === 404, `project ${id} delete should return 200 or 404`);
      }
    });
  }

  if (createdBackupIds.length === 0) {
    console.log("  ⚠️  No backups to clean up");
    return;
  }

  // Batch delete
  await test(`GIVEN ${createdBackupIds.length} test backups WHEN batch deleting THEN all are removed`, async () => {
    const res = await fetch(`${baseUrl}/api/backups`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: createdBackupIds }),
    });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.success, true, "success");
    assertEqual(body.deleted, createdBackupIds.length, "deleted count");
  });

  // Verify deletion
  await test("GIVEN deleted backups WHEN querying by ID THEN returns 404", async () => {
    for (const id of createdBackupIds) {
      const res = await fetch(`${baseUrl}/api/backups/${id}`);
      assertEqual(res.status, 404, `backup ${id} should be 404`);
    }
  });

  // Verify batch delete validation
  await test("GIVEN empty IDs array WHEN batch deleting THEN returns 400", async () => {
    const res = await fetch(`${baseUrl}/api/backups`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [] }),
    });
    assertEqual(res.status, 400, "status");
  });
}

// IDs of categories created during the test — cleaned up at the end
const createdCategoryIds: string[] = [];

// IDs of projects created during the test — cleaned up at the end
const createdProjectIds: string[] = [];

async function suiteCategoryCrud(): Promise<void> {
  console.log("\n📋 Suite: Category CRUD Lifecycle");

  let categoryId = "";

  // Step 1: Create a category
  await test("GIVEN valid category data WHEN creating via POST THEN returns 201 with category object", async () => {
    const res = await fetch(`${baseUrl}/api/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "E2E Test Category", color: "#ef4444", icon: "shield" }),
    });
    assertEqual(res.status, 201, "status");
    const body = await res.json();
    assert(typeof body.id === "string" && body.id.length > 0, "id should be a non-empty string");
    assertEqual(body.name, "E2E Test Category", "name");
    assertEqual(body.color, "#ef4444", "color");
    assertEqual(body.icon, "shield", "icon");
    assertEqual(body.sort_order, 0, "sort_order default");
    categoryId = body.id;
    createdCategoryIds.push(categoryId);
  });

  // Step 2: Verify category appears in list
  await test("GIVEN a created category WHEN listing all categories THEN the new category appears", async () => {
    const res = await fetch(`${baseUrl}/api/categories`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(Array.isArray(body), "response should be an array");
    const found = body.find((c: { id: string }) => c.id === categoryId);
    assert(found !== undefined, "category should appear in list");
    assertEqual(found.name, "E2E Test Category", "name");
  });

  // Step 3: Get category by ID
  await test("GIVEN a created category WHEN getting by ID THEN returns full category data", async () => {
    const res = await fetch(`${baseUrl}/api/categories/${categoryId}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.id, categoryId, "id");
    assertEqual(body.name, "E2E Test Category", "name");
    assertEqual(body.color, "#ef4444", "color");
    assertEqual(body.icon, "shield", "icon");
  });

  // Step 4: Update category
  await test("GIVEN a created category WHEN updating name/color/icon THEN returns updated data", async () => {
    const res = await fetch(`${baseUrl}/api/categories/${categoryId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "E2E Updated", color: "#10b981", icon: "star" }),
    });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.name, "E2E Updated", "name");
    assertEqual(body.color, "#10b981", "color");
    assertEqual(body.icon, "star", "icon");
  });

  // Step 5: Verify update persisted
  await test("GIVEN an updated category WHEN getting by ID THEN returns updated values", async () => {
    const res = await fetch(`${baseUrl}/api/categories/${categoryId}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.name, "E2E Updated", "name");
    assertEqual(body.color, "#10b981", "color");
    assertEqual(body.icon, "star", "icon");
  });

  // Step 6: Assign category to backy-test project
  await test("GIVEN a category and project WHEN assigning category to project THEN project shows category_id", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category_id: categoryId }),
    });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.category_id, categoryId, "category_id");
  });

  // Step 7: Verify project has category
  await test("GIVEN a project with category WHEN getting project THEN category_id is set", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.category_id, categoryId, "category_id");
  });

  // Step 8: Delete category — should cascade (set project category_id to null)
  await test("GIVEN a category assigned to project WHEN deleting category THEN returns success", async () => {
    const res = await fetch(`${baseUrl}/api/categories/${categoryId}`, { method: "DELETE" });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.success, true, "success");
    // Remove from cleanup list since we just deleted it
    const idx = createdCategoryIds.indexOf(categoryId);
    if (idx !== -1) createdCategoryIds.splice(idx, 1);
  });

  // Step 9: Verify project's category_id is now null (CASCADE ON DELETE SET NULL)
  await test("GIVEN a deleted category WHEN getting project THEN category_id is null", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.category_id, null, "category_id should be null after category deletion");
  });

  // Step 10: Verify category is gone from list
  await test("GIVEN a deleted category WHEN listing categories THEN it no longer appears", async () => {
    const res = await fetch(`${baseUrl}/api/categories`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    const found = body.find((c: { id: string }) => c.id === categoryId);
    assertEqual(found, undefined, "deleted category should not appear in list");
  });

  // Step 11: Verify 404 on GET for deleted category
  await test("GIVEN a deleted category WHEN getting by ID THEN returns 404", async () => {
    const res = await fetch(`${baseUrl}/api/categories/${categoryId}`);
    assertEqual(res.status, 404, "status");
  });

  // Step 12: Validation errors
  await test("GIVEN invalid category data WHEN creating THEN returns 400", async () => {
    const res = await fetch(`${baseUrl}/api/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "", color: "invalid" }),
    });
    assertEqual(res.status, 400, "status");
  });
}

async function suiteManualUpload(): Promise<void> {
  console.log("\n📋 Suite: Manual Upload Round-Trip");

  let jsonBackupId = "";
  let zipBackupId = "";
  const uploadTag = `${E2E_TAG_PREFIX}upload-${Date.now()}`;

  // Step 1: Upload JSON file via manual upload endpoint
  await test("GIVEN a valid JSON file WHEN uploading via manual upload THEN returns 201 with backup metadata", async () => {
    const formData = new FormData();
    const jsonBlob = new Blob([JSON.stringify(TEST_JSON_DATA)], { type: "application/json" });
    formData.append("file", new File([jsonBlob], "manual-backup.json", { type: "application/json" }));
    formData.append("projectId", PROJECT_ID);
    formData.append("tag", uploadTag);
    formData.append("environment", "test");

    const res = await fetch(`${baseUrl}/api/backups/upload`, {
      method: "POST",
      body: formData,
    });
    assertEqual(res.status, 201, "status");
    const body = await res.json();
    assert(typeof body.id === "string" && body.id.length > 0, "id should be a non-empty string");
    assertEqual(body.project_id, PROJECT_ID, "project_id");
    assert(body.file_size > 0, "file_size should be positive");
    jsonBackupId = body.id;
    createdBackupIds.push(jsonBackupId);
  });

  // Step 2: Verify backup metadata — should be auto-compressed to ZIP with preview
  await test("GIVEN a manually uploaded JSON WHEN querying metadata THEN shows is_single_json=1 with json_key", async () => {
    const res = await fetch(`${baseUrl}/api/backups/${jsonBackupId}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.id, jsonBackupId, "id");
    assertEqual(body.project_id, PROJECT_ID, "project_id");
    assertEqual(body.environment, "test", "environment");
    assertEqual(body.tag, uploadTag, "tag");
    assertEqual(body.is_single_json, 1, "is_single_json");
    assert(body.json_key !== null, "json_key should be set for JSON upload");
    assertEqual(body.sender_ip, "manual-upload", "sender_ip should be manual-upload");
  });

  // Step 3: Preview the uploaded JSON content
  await test("GIVEN a manually uploaded JSON WHEN previewing THEN returns original content", async () => {
    const res = await fetch(`${baseUrl}/api/backups/${jsonBackupId}/preview`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.backup_id, jsonBackupId, "backup_id");
    assertDeepEqual(body.content, TEST_JSON_DATA, "preview content should match original upload");
  });

  // Step 4: Download and verify content
  await test("GIVEN a manually uploaded JSON WHEN downloading THEN returns auto-compressed ZIP with original content", async () => {
    const res = await fetch(`${baseUrl}/api/backups/${jsonBackupId}/download`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(typeof body.url === "string", "url should be a string");

    // Download is a ZIP (JSON was auto-compressed on upload)
    const downloadRes = await fetch(body.url);
    assertEqual(downloadRes.status, 200, "download status");
    const zipBuffer = await downloadRes.arrayBuffer();
    const zip = await JSZip.loadAsync(zipBuffer);
    const jsonFile = zip.file("manual-backup.json");
    assert(jsonFile !== null, "zip should contain manual-backup.json");
    const text = await jsonFile!.async("text");
    assertDeepEqual(JSON.parse(text), TEST_JSON_DATA, "zip content should match original");
  });

  // Step 5: Upload ZIP file via manual upload
  await test("GIVEN a valid ZIP file WHEN uploading via manual upload THEN returns 201", async () => {
    const zipData = await createZipWithJson(TEST_JSON_DATA, "manual-data.json");
    const formData = new FormData();
    formData.append("file", new File([zipData as BlobPart], "manual-backup.zip", { type: "application/zip" }));
    formData.append("projectId", PROJECT_ID);
    formData.append("environment", "test");

    const res = await fetch(`${baseUrl}/api/backups/upload`, {
      method: "POST",
      body: formData,
    });
    assertEqual(res.status, 201, "status");
    const body = await res.json();
    zipBackupId = body.id;
    createdBackupIds.push(zipBackupId);
  });

  // Step 6: Verify ZIP metadata
  await test("GIVEN a manually uploaded ZIP WHEN querying metadata THEN shows is_single_json=0", async () => {
    const res = await fetch(`${baseUrl}/api/backups/${zipBackupId}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.is_single_json, 0, "is_single_json");
    assertEqual(body.json_key, null, "json_key should be null for ZIP upload");
    assertEqual(body.sender_ip, "manual-upload", "sender_ip");
  });

  // Step 7: Error — missing projectId
  await test("GIVEN no projectId WHEN uploading manually THEN returns 400", async () => {
    const formData = new FormData();
    formData.append("file", new File(["data"], "backup.json", { type: "application/json" }));
    const res = await fetch(`${baseUrl}/api/backups/upload`, {
      method: "POST",
      body: formData,
    });
    assertEqual(res.status, 400, "status");
    const body = await res.json();
    assert(body.error.includes("projectId"), "error should mention projectId");
  });

  // Step 8: Error — invalid project
  await test("GIVEN nonexistent projectId WHEN uploading manually THEN returns 404", async () => {
    const formData = new FormData();
    formData.append("file", new File(["data"], "backup.json", { type: "application/json" }));
    formData.append("projectId", "nonexistent-project-id");
    const res = await fetch(`${baseUrl}/api/backups/upload`, {
      method: "POST",
      body: formData,
    });
    assertEqual(res.status, 404, "status");
  });

  // Step 9: Error — empty file
  await test("GIVEN an empty file WHEN uploading manually THEN returns 400", async () => {
    const formData = new FormData();
    formData.append("file", new File([], "empty.json", { type: "application/json" }));
    formData.append("projectId", PROJECT_ID);
    const res = await fetch(`${baseUrl}/api/backups/upload`, {
      method: "POST",
      body: formData,
    });
    assertEqual(res.status, 400, "status");
    const body = await res.json();
    assert(body.error.includes("empty"), "error should mention empty");
  });

  // Step 10: Error — unsupported file type
  await test("GIVEN a .txt file WHEN uploading manually THEN returns 400", async () => {
    const formData = new FormData();
    formData.append("file", new File(["data"], "backup.txt", { type: "text/plain" }));
    formData.append("projectId", PROJECT_ID);
    const res = await fetch(`${baseUrl}/api/backups/upload`, {
      method: "POST",
      body: formData,
    });
    assertEqual(res.status, 400, "status");
    const body = await res.json();
    assert(body.error.includes("Unsupported"), "error should mention unsupported type");
  });
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

export async function runE2ETests(url: string): Promise<{ passed: number; failed: number; total: number }> {
  baseUrl = url;
  results.length = 0;
  createdBackupIds.length = 0;
  createdCategoryIds.length = 0;
  createdProjectIds.length = 0;

  console.log("🎯 E2E Tests — Backy Self-Bootstrap via backy-test project");
  console.log(`   Base URL: ${baseUrl}`);
  console.log(`   Project:  backy-test (${PROJECT_ID})`);

  // Verify server is live
  const liveRes = await fetch(`${baseUrl}/api/live`);
  if (!liveRes.ok) {
    throw new Error("Server is not responding to health check");
  }

  // Ensure schema is up-to-date (creates webhook_logs table etc.)
  const initRes = await fetch(`${baseUrl}/api/db/init`, { method: "POST" });
  if (!initRes.ok) {
    throw new Error(`Schema init failed: ${initRes.status}`);
  }

  // --- Infrastructure suites ---
  await suiteHealthCheck();
  await suiteDashboardStats();

  // --- Core data flow suites ---
  await suiteHappyPathJson();
  await suiteHappyPathZip();
  await suiteErrorPaths();
  await suiteWebhookLogs();
  await suiteCategoryCrud();
  await suiteManualUpload();

  // --- Project lifecycle suites ---
  await suiteProjectCrud();
  await suiteTokenRegeneration();

  // --- Public API suites ---
  await suiteWebhookGetStatus();

  // --- Query & filter suites ---
  await suiteBackupListAdvanced();

  // --- Delete suites ---
  await suiteSingleBackupDelete();

  // --- Utility suites ---
  await suitePromptGeneration();
  await suiteLogDeletion();

  // --- Cascade & cleanup ---
  await suiteProjectCascadeDelete();
  await suiteCleanup();

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return { passed, failed, total: results.length };
}
