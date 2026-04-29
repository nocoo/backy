/**
 * L2: Stats API E2E tests.
 *
 * Routes covered:
 *   GET /api/stats/totals
 *   GET /api/stats/charts
 */

import { describe, expect, test } from "bun:test";
import { url } from "./config";

describe("L2: API /api/stats", () => {
  test("GET /api/stats/totals returns totals", async () => {
    const res = await fetch(url("/api/stats/totals"));
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      totalProjects: number;
      totalBackups: number;
      totalStorageBytes: number;
    };
    expect(typeof body.totalProjects).toBe("number");
    expect(typeof body.totalBackups).toBe("number");
    expect(typeof body.totalStorageBytes).toBe("number");
  });

  test("GET /api/stats/charts returns chart data", async () => {
    const res = await fetch(url("/api/stats/charts"));
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      projectStats: unknown[];
      dailyBackups: unknown[];
      cronStats: unknown[];
    };
    expect(body).toHaveProperty("projectStats");
    expect(body).toHaveProperty("dailyBackups");
    expect(body).toHaveProperty("cronStats");
    expect(Array.isArray(body.projectStats)).toBe(true);
    expect(Array.isArray(body.dailyBackups)).toBe(true);
    expect(Array.isArray(body.cronStats)).toBe(true);
  });
});
