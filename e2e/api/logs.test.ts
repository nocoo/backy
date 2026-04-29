/**
 * L2: Logs API E2E tests.
 *
 * Routes covered:
 *   GET    /api/logs/webhook
 *   DELETE /api/logs/webhook
 *   GET    /api/logs/cron
 *   DELETE /api/logs/cron
 */

import { describe, expect, test } from "bun:test";
import { url, jsonRequest } from "./config";

describe("L2: API /api/logs/webhook", () => {
  test("GET /api/logs/webhook returns paginated response", async () => {
    const res = await fetch(url("/api/logs/webhook"));
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      logs: unknown[];
      total: number;
    };
    expect(body).toHaveProperty("logs");
    expect(body).toHaveProperty("total");
    expect(Array.isArray(body.logs)).toBe(true);
  });

  test("DELETE /api/logs/webhook deletes logs by ids", async () => {
    // Delete with empty array should succeed
    const res = await jsonRequest("DELETE", "/api/logs/webhook", {
      ids: [],
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { deleted: number };
    expect(body.deleted).toBe(0);
  });
});

describe("L2: API /api/logs/cron", () => {
  test("GET /api/logs/cron returns paginated response", async () => {
    const res = await fetch(url("/api/logs/cron"));
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      logs: unknown[];
      total: number;
    };
    expect(body).toHaveProperty("logs");
    expect(body).toHaveProperty("total");
    expect(Array.isArray(body.logs)).toBe(true);
  });

  test("DELETE /api/logs/cron deletes logs by ids", async () => {
    // Delete with empty array should succeed
    const res = await jsonRequest("DELETE", "/api/logs/cron", {
      ids: [],
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { deleted: number };
    expect(body.deleted).toBe(0);
  });
});
