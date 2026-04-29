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
      projects: number;
      backups: number;
      storage_bytes: number;
    };
    expect(typeof body.projects).toBe("number");
    expect(typeof body.backups).toBe("number");
    expect(typeof body.storage_bytes).toBe("number");
  });

  test("GET /api/stats/charts returns chart data", async () => {
    const res = await fetch(url("/api/stats/charts"));
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      daily: unknown[];
    };
    expect(body).toHaveProperty("daily");
    expect(Array.isArray(body.daily)).toBe(true);
  });
});
