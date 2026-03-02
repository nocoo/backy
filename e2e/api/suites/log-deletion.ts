/**
 * Suite: Log Deletion — delete webhook logs by filter and all
 */

import { test, assert, assertEqual } from "../framework";
import { state } from "../config";

export async function suiteLogDeletion(): Promise<void> {
  console.log("\n📋 Suite: Log Deletion");

  // First verify we have HEAD logs to delete
  await test("GIVEN HEAD webhook logs WHEN deleting by method=HEAD THEN returns success", async () => {
    // Verify HEAD logs exist first
    const checkRes = await fetch(`${state.baseUrl}/api/logs?method=HEAD&pageSize=1`);
    const checkBody = await checkRes.json();
    assert(checkBody.total > 0, "should have HEAD logs to delete");

    const res = await fetch(`${state.baseUrl}/api/logs`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "HEAD" }),
    });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.success, true, "success");
  });

  await test("GIVEN deleted HEAD logs WHEN listing by method=HEAD THEN returns zero results", async () => {
    const res = await fetch(`${state.baseUrl}/api/logs?method=HEAD`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.total, 0, "HEAD logs should be deleted");
    assertEqual(body.items.length, 0, "items should be empty");
  });

  await test("GIVEN remaining logs WHEN deleting with no filters THEN deletes all", async () => {
    // Delete all remaining logs
    const res = await fetch(`${state.baseUrl}/api/logs`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.success, true, "success");

    // Verify all are gone
    const checkRes = await fetch(`${state.baseUrl}/api/logs`);
    const checkBody = await checkRes.json();
    assertEqual(checkBody.total, 0, "all logs should be deleted");
  });
}
