/**
 * L2: API E2E tests — health check and basic endpoints.
 *
 * These tests run against a real wrangler dev server with local SQLite.
 * The E2E runner (scripts/run-e2e.ts) handles server lifecycle.
 */

import { describe, expect, test } from "bun:test";

const BASE_URL = "http://localhost:17018";

describe("L2: API health", () => {
  test("GET /api/live returns ok with dependencies up", async () => {
    const res = await fetch(`${BASE_URL}/api/live`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      status: string;
      dependencies?: {
        d1?: { status: string };
        r2?: { status: string };
      };
    };
    expect(body.status).toBe("ok");
    expect(body.dependencies?.d1?.status).toBe("up");
    expect(body.dependencies?.r2?.status).toBe("up");
  });

  test("GET /api/me returns authenticated user (E2E_SKIP_AUTH)", async () => {
    const res = await fetch(`${BASE_URL}/api/me`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { authenticated: boolean; email: string };
    expect(body.authenticated).toBe(true);
  });
});

describe("L2: API projects", () => {
  test("GET /api/projects returns array", async () => {
    const res = await fetch(`${BASE_URL}/api/projects`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("POST /api/projects creates a project", async () => {
    const res = await fetch(`${BASE_URL}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "E2E Test Project" }),
    });
    expect(res.status).toBe(201);

    const body = (await res.json()) as { id: string; name: string };
    expect(body.name).toBe("E2E Test Project");
    expect(body.id).toBeTruthy();
  });
});

describe("L2: API categories", () => {
  test("GET /api/categories returns array", async () => {
    const res = await fetch(`${BASE_URL}/api/categories`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

describe("L2: API backups", () => {
  test("GET /api/backups returns paginated response", async () => {
    const res = await fetch(`${BASE_URL}/api/backups`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      environments: unknown[];
      projects: unknown[];
    };
    expect(body).toHaveProperty("environments");
    expect(body).toHaveProperty("projects");
  });
});

describe("L2: API logs", () => {
  test("GET /api/logs/webhook returns paginated response", async () => {
    const res = await fetch(`${BASE_URL}/api/logs/webhook`);
    expect(res.status).toBe(200);
  });

  test("GET /api/logs/cron returns paginated response", async () => {
    const res = await fetch(`${BASE_URL}/api/logs/cron`);
    expect(res.status).toBe(200);
  });
});
