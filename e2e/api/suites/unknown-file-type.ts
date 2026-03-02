/**
 * Suite: Unknown File Type — upload, no preview, download, restore
 */

import { test, assert, assertEqual } from "../framework";
import { state, WEBHOOK_TOKEN } from "../config";
import { webhookUrl, tag } from "../helpers";

export async function suiteUnknownFileType(): Promise<void> {
  console.log("\n📋 Suite: Unknown File Type — Upload & No Preview");

  let webhookBackupId = "";
  const testTag = tag();

  // Step 1: Upload unknown file type via webhook
  await test("GIVEN a .csv file WHEN uploading via webhook THEN returns 201", async () => {
    const csvContent = "name,value\nalpha,1\nbeta,2\n";
    const formData = new FormData();
    formData.append("file", new File([csvContent], "data.csv", { type: "text/csv" }));
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

  // Step 2: Verify metadata — file_type=unknown
  await test("GIVEN an unknown-type backup WHEN querying metadata THEN file_type=unknown", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups/${webhookBackupId}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.file_type, "unknown", "file_type");
    assertEqual(body.is_single_json, 0, "is_single_json");
    assertEqual(body.json_key, null, "json_key should be null");
  });

  // Step 3: Extract should fail for unknown type
  await test("GIVEN an unknown-type backup WHEN extracting THEN returns 400 (not extractable)", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups/${webhookBackupId}/extract`, { method: "POST" });
    assertEqual(res.status, 400, "status");
    const body = await res.json();
    assert(body.error.toLowerCase().includes("preview") || body.error.toLowerCase().includes("extract"),
      "error should mention preview or extraction");
  });

  // Step 4: Preview should fail (no json_key, not extractable)
  await test("GIVEN an unknown-type backup WHEN requesting preview THEN returns 404", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups/${webhookBackupId}/preview`);
    assertEqual(res.status, 404, "status");
  });

  // Step 5: Download should still work
  await test("GIVEN an unknown-type backup WHEN downloading THEN returns valid presigned URL", async () => {
    const dlRes = await fetch(`${state.baseUrl}/api/backups/${webhookBackupId}/download`);
    assertEqual(dlRes.status, 200, "status");
    const body = await dlRes.json();
    assert(typeof body.url === "string", "url should be a string");

    // Download and verify content
    const downloadRes = await fetch(body.url);
    assertEqual(downloadRes.status, 200, "download status");
    const text = await downloadRes.text();
    assert(text.includes("alpha"), "downloaded content should contain CSV data");
  });

  // Step 6: Restore should work
  await test("GIVEN an unknown-type backup WHEN restoring THEN returns valid download URL", async () => {
    const res = await fetch(`${state.baseUrl}/api/restore/${webhookBackupId}?token=${WEBHOOK_TOKEN}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(typeof body.url === "string", "url should be a string");
  });
}
