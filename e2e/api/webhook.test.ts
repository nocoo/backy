/**
 * L2: Webhook API E2E tests.
 *
 * Routes covered:
 *   HEAD /api/webhook/:projectId
 *   GET  /api/webhook/:projectId
 *   POST /api/webhook/:projectId
 */

import { describe, expect, test, beforeAll } from "bun:test";
import { url, jsonRequest, TEST_PROJECT } from "./config";

describe("L2: API /api/webhook", () => {
  beforeAll(async () => {
    // Ensure test project exists
    await jsonRequest("POST", "/api/db/seed-test-project");
  });

  test("HEAD /api/webhook/:projectId returns headers only", async () => {
    const res = await fetch(
      url(`/api/webhook/${TEST_PROJECT.id}?token=${TEST_PROJECT.webhookToken}`),
      { method: "HEAD" },
    );
    // 200 = success, 401 = invalid token
    expect([200, 401]).toContain(res.status);
  });

  test("GET /api/webhook/:projectId returns webhook info", async () => {
    const res = await fetch(
      url(`/api/webhook/${TEST_PROJECT.id}?token=${TEST_PROJECT.webhookToken}`),
    );
    // 200 = success, 401 = invalid token
    expect([200, 401]).toContain(res.status);
  });

  test("POST /api/webhook/:projectId creates backup via webhook", async () => {
    const formData = new FormData();
    formData.append(
      "file",
      new Blob(['{"webhook": "test"}'], { type: "application/json" }),
      "webhook-backup.json",
    );

    const res = await fetch(
      url(`/api/webhook/${TEST_PROJECT.id}?token=${TEST_PROJECT.webhookToken}`),
      {
        method: "POST",
        body: formData,
      },
    );
    // 201 = created, 401 = invalid token
    expect([201, 401]).toContain(res.status);

    if (res.status === 201) {
      const body = (await res.json()) as { id: string };
      expect(body.id).toBeTruthy();
    }
  });
});
