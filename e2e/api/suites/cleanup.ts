/**
 * Suite: Cleanup — remove all test data created during the run
 */

import { test, assert, assertEqual } from "../framework";
import { state } from "../config";

export async function suiteCleanup(): Promise<void> {
  console.log("\n📋 Suite: Cleanup");

  // Clean up any remaining categories
  if (state.createdCategoryIds.length > 0) {
    await test(`GIVEN ${state.createdCategoryIds.length} test categories WHEN deleting THEN all are removed`, async () => {
      for (const id of state.createdCategoryIds) {
        const res = await fetch(`${state.baseUrl}/api/categories/${id}`, { method: "DELETE" });
        assert(res.status === 200 || res.status === 404, `category ${id} delete should return 200 or 404`);
      }
    });
  }

  // Clean up any remaining projects (not deleted by cascade suite)
  if (state.createdProjectIds.length > 0) {
    await test(`GIVEN ${state.createdProjectIds.length} test projects WHEN deleting THEN all are removed`, async () => {
      for (const id of state.createdProjectIds) {
        const res = await fetch(`${state.baseUrl}/api/projects/${id}`, { method: "DELETE" });
        assert(res.status === 200 || res.status === 404, `project ${id} delete should return 200 or 404`);
      }
    });
  }

  if (state.createdBackupIds.length === 0) {
    console.log("  ⚠️  No backups to clean up");
    return;
  }

  // Batch delete
  await test(`GIVEN ${state.createdBackupIds.length} test backups WHEN batch deleting THEN all are removed`, async () => {
    const res = await fetch(`${state.baseUrl}/api/backups`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: state.createdBackupIds }),
    });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.success, true, "success");
    assertEqual(body.deleted, state.createdBackupIds.length, "deleted count");
  });

  // Verify deletion
  await test("GIVEN deleted backups WHEN querying by ID THEN returns 404", async () => {
    for (const id of state.createdBackupIds) {
      const res = await fetch(`${state.baseUrl}/api/backups/${id}`);
      assertEqual(res.status, 404, `backup ${id} should be 404`);
    }
  });

  // Verify batch delete validation
  await test("GIVEN empty IDs array WHEN batch deleting THEN returns 400", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [] }),
    });
    assertEqual(res.status, 400, "status");
  });
}
