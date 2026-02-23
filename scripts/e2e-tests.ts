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

async function suiteCleanup(): Promise<void> {
  console.log("\n📋 Suite: Cleanup");

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

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

export async function runE2ETests(url: string): Promise<{ passed: number; failed: number; total: number }> {
  baseUrl = url;
  results.length = 0;
  createdBackupIds.length = 0;

  console.log("🎯 E2E Tests — Backy Self-Bootstrap via backy-test project");
  console.log(`   Base URL: ${baseUrl}`);
  console.log(`   Project:  backy-test (${PROJECT_ID})`);

  // Verify server is live
  const liveRes = await fetch(`${baseUrl}/api/live`);
  if (!liveRes.ok) {
    throw new Error("Server is not responding to health check");
  }

  await suiteHappyPathJson();
  await suiteHappyPathZip();
  await suiteErrorPaths();
  await suiteCleanup();

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return { passed, failed, total: results.length };
}
