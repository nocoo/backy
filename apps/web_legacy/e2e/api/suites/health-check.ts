/**
 * Suite: Health Check — verifies /api/live endpoint
 */

import { test, assert, assertEqual } from "../framework";
import { state } from "../config";

export async function suiteHealthCheck(): Promise<void> {
  console.log("\n📋 Suite: Health Check");

  await test("GIVEN a running server WHEN requesting /api/live THEN returns 200 with health status", async () => {
    const res = await fetch(`${state.baseUrl}/api/live`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.status, "ok", "status field");
    assert(typeof body.version === "string" && body.version.length > 0, "version should be a non-empty string");
    assert(typeof body.timestamp === "string", "timestamp should be a string");
    assert(typeof body.uptime_s === "number" && body.uptime_s >= 0, "uptime_s should be a non-negative number");
    // Verify dependencies
    assert(body.dependencies !== undefined, "dependencies should exist");
    assertEqual(body.dependencies.d1.status, "up", "d1 status");
    assertEqual(body.dependencies.r2.status, "up", "r2 status");
    assert(typeof body.dependencies.d1.latency_ms === "number", "d1 latency_ms should be a number");
    assert(typeof body.dependencies.r2.latency_ms === "number", "r2 latency_ms should be a number");
  });

  await test("GIVEN a running server WHEN requesting /api/live THEN has no-cache headers", async () => {
    const res = await fetch(`${state.baseUrl}/api/live`);
    assertEqual(res.status, 200, "status");
    const cacheControl = res.headers.get("cache-control");
    assert(cacheControl !== null && cacheControl.includes("no-store"), "should have no-store cache control");
  });
}
