/**
 * Suite: Dashboard Stats — verifies /api/stats and /api/stats/charts
 */

import { test, assert, assertEqual } from "../framework";
import { state } from "../config";

export async function suiteDashboardStats(): Promise<void> {
  console.log("\n📋 Suite: Dashboard Stats");

  await test("GIVEN existing data WHEN requesting /api/stats THEN returns aggregate statistics", async () => {
    const res = await fetch(`${state.baseUrl}/api/stats`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(typeof body.totalProjects === "number" && body.totalProjects > 0, "totalProjects should be > 0");
    assert(typeof body.totalBackups === "number" && body.totalBackups >= 0, "totalBackups should be >= 0");
    assert(typeof body.totalStorageBytes === "number" && body.totalStorageBytes >= 0, "totalStorageBytes should be >= 0");
  });

  await test("GIVEN existing data WHEN requesting /api/stats/charts THEN returns chart data", async () => {
    const res = await fetch(`${state.baseUrl}/api/stats/charts`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(Array.isArray(body.projectStats), "projectStats should be an array");
    assert(Array.isArray(body.dailyBackups), "dailyBackups should be an array");
  });

  await test("GIVEN chart data WHEN inspecting projectStats THEN each entry has expected fields", async () => {
    const res = await fetch(`${state.baseUrl}/api/stats/charts`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(body.projectStats.length > 0, "projectStats should have entries");
    const entry = body.projectStats[0];
    assert(typeof entry.project_id === "string", "project_id should be a string");
    assert(typeof entry.project_name === "string", "project_name should be a string");
    assert(typeof entry.backup_count === "number", "backup_count should be a number");
    assert(typeof entry.total_size === "number", "total_size should be a number");
  });

  await test("GIVEN chart data WHEN inspecting dailyBackups THEN entries have date and count", async () => {
    const res = await fetch(`${state.baseUrl}/api/stats/charts`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    // dailyBackups may be empty if no recent backups, but if populated, verify structure
    if (body.dailyBackups.length > 0) {
      const entry = body.dailyBackups[0];
      assert(typeof entry.date === "string", "date should be a string");
      assert(typeof entry.count === "number", "count should be a number");
    }
  });
}
