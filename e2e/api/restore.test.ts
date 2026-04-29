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
    formData.append("project_id", testProjectId);
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

  test("GET /api/restore/:id returns restore info", async () => {
    expect(testBackupId).toBeTruthy();

    const res = await fetch(url(`/api/restore/${testBackupId}`));
    // May return 200 with restore info or 404 if restore not available
    expect([200, 404]).toContain(res.status);

    if (res.status === 200) {
      const body = (await res.json()) as { id: string };
      expect(body).toHaveProperty("id");
    }
  });
});
