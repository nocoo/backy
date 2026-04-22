/**
 * Suite: Backup List Advanced Filters — pagination, sorting, filtering
 */

import { test, assert, assertEqual } from "../framework";
import { state, PROJECT_ID } from "../config";

export async function suiteBackupListAdvanced(): Promise<void> {
  console.log("\n📋 Suite: Backup List Advanced Filters");

  // Uses backups created by happy path suites

  await test("GIVEN backups WHEN listing with projectId filter THEN returns only matching backups", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups?projectId=${PROJECT_ID}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(body.items.length > 0, "should have backups for backy-test");
    for (const b of body.items) {
      assertEqual(b.project_id, PROJECT_ID, `backup ${b.id} project_id`);
    }
  });

  await test("GIVEN backups WHEN listing with environment filter THEN returns only matching environment", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups?environment=test`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    for (const b of body.items) {
      assertEqual(b.environment, "test", `backup ${b.id} environment`);
    }
  });

  await test("GIVEN backups WHEN listing with sortBy=file_size&sortOrder=asc THEN returns sorted results", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups?sortBy=file_size&sortOrder=asc&projectId=${PROJECT_ID}`);
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
    const res = await fetch(`${state.baseUrl}/api/backups?page=1&pageSize=1`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.items.length, 1, "should return exactly 1 item");
    assertEqual(body.page, 1, "page");
    assertEqual(body.pageSize, 1, "pageSize");
    assert(body.total > 0, "total should be > 0");
    assert(body.totalPages >= 1, "totalPages should be >= 1");
  });

  await test("GIVEN backups WHEN listing with very high page number THEN returns empty items", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups?page=9999&pageSize=20`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.items.length, 0, "should return 0 items for out-of-range page");
    assert(body.total >= 0, "total should still be returned");
  });

  await test("GIVEN backups WHEN listing THEN response includes environments and projects arrays", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups`);
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
