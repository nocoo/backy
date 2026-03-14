/**
 * Suite: Happy Path — JSON Backup (upload → query → preview → download → restore)
 */

import { test, assert, assertEqual, assertDeepEqual } from "../framework";
import { state, PROJECT_ID, WEBHOOK_TOKEN, TEST_JSON_DATA } from "../config";
import { uploadJsonBackup, tag } from "../helpers";

export async function suiteHappyPathJson(): Promise<void> {
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
    state.createdBackupIds.push(backupId);
  });

  // Step 2: Query the backup via protected API
  await test("GIVEN a created backup WHEN querying by ID THEN returns full backup metadata", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups/${backupId}`);
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
    const res = await fetch(`${state.baseUrl}/api/backups/${backupId}/preview`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.backup_id, backupId, "backup_id");
    assertDeepEqual(body.content, TEST_JSON_DATA, "content should match original upload");
  });

  // Step 4: Download the backup
  await test("GIVEN a JSON backup WHEN requesting download URL THEN returns presigned URL that serves original content", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups/${backupId}/download`);
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
    const res = await fetch(`${state.baseUrl}/api/restore/${backupId}`, {
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

  // Step 5b: Restore with query param token should no longer work
  await test("GIVEN a JSON backup WHEN requesting restore with ?token= query param THEN returns 401", async () => {
    const res = await fetch(`${state.baseUrl}/api/restore/${backupId}?token=${WEBHOOK_TOKEN}`);
    assertEqual(res.status, 401, "status");
  });

  // Step 6: Backup appears in list
  await test("GIVEN a created backup WHEN listing backups with search THEN backup appears in results", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups?search=${testTag}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(body.items.length >= 1, "should have at least 1 result");
    const found = body.items.find((b: { id: string }) => b.id === backupId);
    assert(found !== undefined, "backup should appear in search results");
  });
}
