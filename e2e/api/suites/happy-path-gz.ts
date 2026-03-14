/**
 * Suite: Happy Path — GZ Backup (upload → extract → preview → download → restore)
 */

import { test, assert, assertEqual, assertDeepEqual } from "../framework";
import { state, PROJECT_ID, WEBHOOK_TOKEN, TEST_JSON_DATA } from "../config";
import { webhookUrl, tag, createGzWithJson } from "../helpers";

export async function suiteHappyPathGz(): Promise<void> {
  console.log("\n📋 Suite: Happy Path — GZ Backup");

  let webhookBackupId = "";
  let manualBackupId = "";
  const testTag = tag();

  // Step 1: Upload GZ backup via webhook
  await test("GIVEN a .json.gz file WHEN uploading via webhook THEN returns 201", async () => {
    const gzData = await createGzWithJson(TEST_JSON_DATA);
    const formData = new FormData();
    formData.append("file", new File([gzData as BlobPart], "backup.json.gz", { type: "application/gzip" }));
    formData.append("environment", "test");
    formData.append("tag", testTag);

    const res = await fetch(webhookUrl(), {
      method: "POST",
      headers: { Authorization: `Bearer ${WEBHOOK_TOKEN}` },
      body: formData,
    });
    assertEqual(res.status, 201, "status");
    const body = await res.json();
    webhookBackupId = body.id;
    state.createdBackupIds.push(webhookBackupId);
  });

  // Step 2: Verify metadata — should be gz type, not single json
  await test("GIVEN a GZ backup WHEN querying metadata THEN file_type=gz and is_single_json=0", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups/${webhookBackupId}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.file_type, "gz", "file_type");
    assertEqual(body.is_single_json, 0, "is_single_json");
    assertEqual(body.json_key, null, "json_key should be null before extraction");
  });

  // Step 3: Preview should fail before extraction
  await test("GIVEN a GZ backup without extraction WHEN requesting preview THEN returns 404", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups/${webhookBackupId}/preview`);
    assertEqual(res.status, 404, "status");
  });

  // Step 4: Extract JSON from GZ
  await test("GIVEN a GZ backup WHEN extracting THEN succeeds with JSON content", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups/${webhookBackupId}/extract`, { method: "POST" });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(body.json_key !== undefined, "json_key should be set");
    assert(body.source_file === "decompressed.json", "source_file");
    assertEqual(body.json_files_found, 1, "json_files_found");
  });

  // Step 5: Re-extract should be idempotent
  await test("GIVEN an already-extracted GZ backup WHEN extracting again THEN returns existing json_key", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups/${webhookBackupId}/extract`, { method: "POST" });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(body.message.includes("already"), "should indicate already extracted");
  });

  // Step 6: Preview should work after extraction
  await test("GIVEN an extracted GZ backup WHEN requesting preview THEN returns the JSON content", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups/${webhookBackupId}/preview`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertDeepEqual(body.content, TEST_JSON_DATA, "content should match original data");
  });

  // Step 7: Download original .gz and verify it's valid gzip
  await test("GIVEN a GZ backup WHEN downloading THEN returns valid gzip data", async () => {
    const dlRes = await fetch(`${state.baseUrl}/api/backups/${webhookBackupId}/download`);
    const { url } = await dlRes.json();
    const gzRes = await fetch(url);
    assertEqual(gzRes.status, 200, "download status");
    const buffer = await gzRes.arrayBuffer();
    // Verify gzip magic bytes (1f 8b)
    const bytes = new Uint8Array(buffer);
    assertEqual(bytes[0], 0x1f, "gzip magic byte 1");
    assertEqual(bytes[1], 0x8b, "gzip magic byte 2");
  });

  // Step 8: Upload GZ via manual upload
  await test("GIVEN a .json.gz file WHEN uploading via manual upload THEN returns 201", async () => {
    const gzData = await createGzWithJson(TEST_JSON_DATA);
    const formData = new FormData();
    formData.append("file", new File([gzData as BlobPart], "manual-backup.json.gz", { type: "application/gzip" }));
    formData.append("projectId", PROJECT_ID);
    formData.append("environment", "test");

    const res = await fetch(`${state.baseUrl}/api/backups/upload`, {
      method: "POST",
      body: formData,
    });
    assertEqual(res.status, 201, "status");
    const body = await res.json();
    manualBackupId = body.id;
    state.createdBackupIds.push(manualBackupId);
  });

  // Step 9: Verify manual upload metadata
  await test("GIVEN a manually uploaded GZ WHEN querying metadata THEN file_type=gz", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups/${manualBackupId}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.file_type, "gz", "file_type");
    assertEqual(body.sender_ip, "manual-upload", "sender_ip");
  });

  // Step 10: Restore endpoint works for GZ
  await test("GIVEN a GZ backup WHEN restoring via public endpoint THEN returns valid download URL", async () => {
    const res = await fetch(`${state.baseUrl}/api/restore/${webhookBackupId}`, {
      headers: { Authorization: `Bearer ${WEBHOOK_TOKEN}` },
    });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(typeof body.url === "string", "url should be a string");
  });
}
