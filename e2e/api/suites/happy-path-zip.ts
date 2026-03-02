/**
 * Suite: Happy Path — ZIP Backup (upload → extract → preview → download → restore)
 */

import JSZip from "jszip";
import { test, assert, assertEqual, assertDeepEqual } from "../framework";
import { state, WEBHOOK_TOKEN, TEST_JSON_DATA } from "../config";
import { webhookUrl, tag, createZipWithJson } from "../helpers";

export async function suiteHappyPathZip(): Promise<void> {
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
    state.createdBackupIds.push(backupId);
  });

  // Step 2: Verify it's a zip backup (no json_key yet)
  await test("GIVEN a ZIP backup WHEN querying metadata THEN is_single_json=0 and json_key is null", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups/${backupId}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.is_single_json, 0, "is_single_json");
    assertEqual(body.json_key, null, "json_key should be null before extraction");
  });

  // Step 3: Preview should fail before extraction
  await test("GIVEN a ZIP backup without extraction WHEN requesting preview THEN returns 404 with hint", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups/${backupId}/preview`);
    assertEqual(res.status, 404, "status");
    const body = await res.json();
    assert(body.error.includes("Extract"), "error should mention extraction");
  });

  // Step 4: Extract JSON from ZIP
  await test("GIVEN a ZIP backup WHEN extracting JSON THEN succeeds and sets json_key", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups/${backupId}/extract`, { method: "POST" });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(body.json_key !== undefined, "json_key should be set");
    assert(body.source_file === "data.json", "source_file should be data.json");
    assertEqual(body.json_files_found, 1, "json_files_found");
  });

  // Step 5: Re-extract should be idempotent
  await test("GIVEN an already-extracted backup WHEN extracting again THEN returns existing json_key", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups/${backupId}/extract`, { method: "POST" });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(body.message.includes("already"), "should indicate already extracted");
  });

  // Step 6: Preview should work after extraction
  await test("GIVEN an extracted ZIP backup WHEN requesting preview THEN returns the JSON content", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups/${backupId}/preview`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertDeepEqual(body.content, TEST_JSON_DATA, "content should match original data");
  });

  // Step 7: Download the original ZIP and verify it's a valid zip
  await test("GIVEN a ZIP backup WHEN downloading THEN can open and read the JSON inside", async () => {
    const dlRes = await fetch(`${state.baseUrl}/api/backups/${backupId}/download`);
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
    const res = await fetch(`${state.baseUrl}/api/restore/${backupId}?token=${WEBHOOK_TOKEN}`);
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
