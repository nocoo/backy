/**
 * Suite: Manual Upload Round-Trip — JSON and ZIP uploads via /api/backups/upload
 */

import JSZip from "jszip";
import { test, assert, assertEqual, assertDeepEqual } from "../framework";
import { state, PROJECT_ID, E2E_TAG_PREFIX, TEST_JSON_DATA } from "../config";
import { createZipWithJson } from "../helpers";

export async function suiteManualUpload(): Promise<void> {
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

    const res = await fetch(`${state.baseUrl}/api/backups/upload`, {
      method: "POST",
      body: formData,
    });
    assertEqual(res.status, 201, "status");
    const body = await res.json();
    assert(typeof body.id === "string" && body.id.length > 0, "id should be a non-empty string");
    assertEqual(body.project_id, PROJECT_ID, "project_id");
    assert(body.file_size > 0, "file_size should be positive");
    jsonBackupId = body.id;
    state.createdBackupIds.push(jsonBackupId);
  });

  // Step 2: Verify backup metadata — should be auto-compressed to ZIP with preview
  await test("GIVEN a manually uploaded JSON WHEN querying metadata THEN shows is_single_json=1 with json_key", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups/${jsonBackupId}`);
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
    const res = await fetch(`${state.baseUrl}/api/backups/${jsonBackupId}/preview`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.backup_id, jsonBackupId, "backup_id");
    assertDeepEqual(body.content, TEST_JSON_DATA, "preview content should match original upload");
  });

  // Step 4: Download and verify content
  await test("GIVEN a manually uploaded JSON WHEN downloading THEN returns auto-compressed ZIP with original content", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups/${jsonBackupId}/download`);
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

    const res = await fetch(`${state.baseUrl}/api/backups/upload`, {
      method: "POST",
      body: formData,
    });
    assertEqual(res.status, 201, "status");
    const body = await res.json();
    zipBackupId = body.id;
    state.createdBackupIds.push(zipBackupId);
  });

  // Step 6: Verify ZIP metadata
  await test("GIVEN a manually uploaded ZIP WHEN querying metadata THEN shows is_single_json=0", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups/${zipBackupId}`);
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
    const res = await fetch(`${state.baseUrl}/api/backups/upload`, {
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
    const res = await fetch(`${state.baseUrl}/api/backups/upload`, {
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
    const res = await fetch(`${state.baseUrl}/api/backups/upload`, {
      method: "POST",
      body: formData,
    });
    assertEqual(res.status, 400, "status");
    const body = await res.json();
    assert(body.error.includes("empty"), "error should mention empty");
  });

  // Step 10: Unknown file type — now accepted (stored as-is, no preview)
  await test("GIVEN a .txt file WHEN uploading manually THEN returns 201 (all formats accepted)", async () => {
    const txtTag = `${E2E_TAG_PREFIX}txt-${Date.now()}`;
    const formData = new FormData();
    formData.append("file", new File(["hello world"], "notes.txt", { type: "text/plain" }));
    formData.append("projectId", PROJECT_ID);
    formData.append("environment", "test");
    formData.append("tag", txtTag);
    const res = await fetch(`${state.baseUrl}/api/backups/upload`, {
      method: "POST",
      body: formData,
    });
    assertEqual(res.status, 201, "status");
    const body = await res.json();
    assert(typeof body.id === "string" && body.id.length > 0, "id should be a non-empty string");
    state.createdBackupIds.push(body.id);
  });
}
