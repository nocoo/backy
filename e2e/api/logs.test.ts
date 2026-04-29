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
      items: unknown[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };
    expect(body).toHaveProperty("items");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("page");
    expect(body).toHaveProperty("pageSize");
    expect(body).toHaveProperty("totalPages");
    expect(Array.isArray(body.items)).toBe(true);
  });

  test("DELETE /api/logs/webhook deletes logs", async () => {
    const res = await jsonRequest("DELETE", "/api/logs/webhook", {});
    expect(res.status).toBe(200);

    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });
});

describe("L2: API /api/logs/cron", () => {
  test("GET /api/logs/cron returns paginated response", async () => {
    const res = await fetch(url("/api/logs/cron"));
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      items: unknown[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };
    expect(body).toHaveProperty("items");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("page");
    expect(body).toHaveProperty("pageSize");
    expect(body).toHaveProperty("totalPages");
    expect(Array.isArray(body.items)).toBe(true);
  });

  test("DELETE /api/logs/cron deletes logs", async () => {
    const res = await jsonRequest("DELETE", "/api/logs/cron", {});
    // Handler returns 204 No Content
    expect(res.status).toBe(204);
  });
});
