/**
 * Suite: Single Backup Delete — create, delete, verify gone
 */

import { test, assertEqual } from "../framework";
import { state, E2E_TAG_PREFIX } from "../config";
import { uploadJsonBackup } from "../helpers";

export async function suiteSingleBackupDelete(): Promise<void> {
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
    const res = await fetch(`${state.baseUrl}/api/backups/${backupId}`, { method: "DELETE" });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.success, true, "success");
  });

  // Step 3: Verify deletion
  await test("GIVEN a deleted backup WHEN getting by ID THEN returns 404", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups/${backupId}`);
    assertEqual(res.status, 404, "status");
  });

  // Step 4: Delete nonexistent backup
  await test("GIVEN a nonexistent backup WHEN deleting THEN returns 404", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups/nonexistent-backup-id-xyz`, { method: "DELETE" });
    assertEqual(res.status, 404, "status");
  });
}
