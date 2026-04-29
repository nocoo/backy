/**
 * L2: DB API E2E tests.
 *
 * Routes covered:
 *   POST /api/db/init
 *   GET  /api/db/init/marker
 *   POST /api/db/seed-test-project
 */

import { describe, expect, test } from "bun:test";
import { url, jsonRequest, TEST_PROJECT } from "./config";

describe("L2: API /api/db", () => {
  test("POST /api/db/init initializes schema", async () => {
    const res = await jsonRequest("POST", "/api/db/init");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { ok: boolean; message: string };
    expect(body.ok).toBe(true);
    expect(body.message).toBe("Schema initialized");
  });

  test("GET /api/db/init/marker returns test marker", async () => {
    const res = await fetch(url("/api/db/init/marker"));
    expect(res.status).toBe(200);

    const body = (await res.json()) as { marker: string | null };
    expect(body).toHaveProperty("marker");
  });

  test("POST /api/db/seed-test-project seeds test project", async () => {
    const res = await jsonRequest("POST", "/api/db/seed-test-project");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      action: string;
      projectId: string;
      webhookToken: string;
      cleanedBackups: number;
    };
    expect(["created", "verified", "reset"]).toContain(body.action);
    expect(body.projectId).toBe(TEST_PROJECT.id);
    expect(body.webhookToken).toBe(TEST_PROJECT.webhookToken);
    expect(typeof body.cleanedBackups).toBe("number");
  });
});
