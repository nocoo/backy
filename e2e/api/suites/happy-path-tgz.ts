/**
 * Suite: Happy Path — TGZ Backup (upload → extract → preview → download)
 */

import { test, assert, assertEqual, assertDeepEqual } from "../framework";
import { state, PROJECT_ID, WEBHOOK_TOKEN, TEST_JSON_DATA } from "../config";
import { webhookUrl, tag, createTgzWithJson } from "../helpers";

export async function suiteHappyPathTgz(): Promise<void> {
  console.log("\n📋 Suite: Happy Path — TGZ Backup");

  let backupId = "";
  const testTag = tag();

  // Step 1: Upload TGZ backup via webhook
  await test("GIVEN a .tar.gz file WHEN uploading via webhook THEN returns 201", async () => {
    const tgzData = await createTgzWithJson(TEST_JSON_DATA, "config.json");
    const formData = new FormData();
    formData.append("file", new File([tgzData as BlobPart], "backup.tar.gz", { type: "application/gzip" }));
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
    state.createdBackupIds.push(backupId);
  });

  // Step 2: Verify metadata — should be tgz type
  await test("GIVEN a TGZ backup WHEN querying metadata THEN file_type=tgz", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups/${backupId}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.file_type, "tgz", "file_type");
    assertEqual(body.is_single_json, 0, "is_single_json");
    assertEqual(body.json_key, null, "json_key should be null before extraction");
  });

  // Step 3: Extract JSON from TGZ
  await test("GIVEN a TGZ backup WHEN extracting THEN succeeds with JSON content from tar entry", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups/${backupId}/extract`, { method: "POST" });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(body.json_key !== undefined, "json_key should be set");
    assertEqual(body.source_file, "config.json", "source_file should be the tar entry name");
    assertEqual(body.json_files_found, 1, "json_files_found");
  });

  // Step 4: Preview should work after extraction
  await test("GIVEN an extracted TGZ backup WHEN requesting preview THEN returns the JSON content", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups/${backupId}/preview`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertDeepEqual(body.content, TEST_JSON_DATA, "content should match original data");
  });

  // Step 5: Download original .tar.gz and verify it's valid gzip
  await test("GIVEN a TGZ backup WHEN downloading THEN returns valid gzip data", async () => {
    const dlRes = await fetch(`${state.baseUrl}/api/backups/${backupId}/download`);
    const { url } = await dlRes.json();
    const tgzRes = await fetch(url);
    assertEqual(tgzRes.status, 200, "download status");
    const buffer = await tgzRes.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    assertEqual(bytes[0], 0x1f, "gzip magic byte 1");
    assertEqual(bytes[1], 0x8b, "gzip magic byte 2");
  });

  // Step 6: Manual upload TGZ
  await test("GIVEN a .tar.gz file WHEN uploading via manual upload THEN returns 201", async () => {
    const tgzData = await createTgzWithJson(TEST_JSON_DATA);
    const formData = new FormData();
    formData.append("file", new File([tgzData as BlobPart], "manual.tar.gz", { type: "application/gzip" }));
    formData.append("projectId", PROJECT_ID);
    formData.append("environment", "test");

    const res = await fetch(`${state.baseUrl}/api/backups/upload`, {
      method: "POST",
      body: formData,
    });
    assertEqual(res.status, 201, "status");
    const body = await res.json();
    state.createdBackupIds.push(body.id);
  });
}
