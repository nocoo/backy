/**
 * L2: Restore API E2E tests.
 *
 * Routes covered:
 *   GET /api/restore/:id
 */

import { describe, expect, test, beforeAll } from "bun:test";
import { url, jsonRequest } from "./config";

describe("L2: API /api/restore", () => {
  let testBackupId: string;
  let testProjectId: string;

  beforeAll(async () => {
    // Create a test project
    const projRes = await jsonRequest("POST", "/api/projects", {
      name: "Restore Test Project",
    });
    const proj = (await projRes.json()) as { id: string };
    testProjectId = proj.id;

    // Create a test backup
    const formData = new FormData();
    formData.append("projectId", testProjectId);
    formData.append("environment", "test");
    formData.append(
      "file",
      new Blob(['{"restore": "test"}'], { type: "application/json" }),
      "restore-test.json",
    );

    const res = await fetch(url("/api/backups/upload"), {
      method: "POST",
      body: formData,
    });
    const body = (await res.json()) as { id: string };
    testBackupId = body.id;
  });

  test("GET /api/restore/:id without token returns 401", async () => {
    expect(testBackupId).toBeTruthy();

    const res = await fetch(url(`/api/restore/${testBackupId}`));
    expect(res.status).toBe(401);

    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Missing authentication");
  });

  test("GET /api/restore/:id with invalid token returns 403", async () => {
    expect(testBackupId).toBeTruthy();

    const res = await fetch(url(`/api/restore/${testBackupId}?token=invalid`));
    // 403 = invalid token, 404 = backup not found
    expect([403, 404]).toContain(res.status);
  });
});
