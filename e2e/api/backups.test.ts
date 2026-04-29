/**
 * L2: Backups API E2E tests.
 *
 * Routes covered:
 *   GET    /api/backups
 *   POST   /api/backups/upload
 *   DELETE /api/backups (batch)
 *   GET    /api/backups/:id
 *   DELETE /api/backups/:id
 *   GET    /api/backups/:id/download
 *   GET    /api/backups/:id/preview
 *   POST   /api/backups/:id/extract
 *   GET    /api/backups/:id/restore-command
 */

import { describe, expect, test, beforeAll } from "bun:test";
import { url, jsonRequest, TEST_PROJECT } from "./config";

describe("L2: API /api/backups", () => {
  let testProjectId: string;
  let createdBackupId: string;

  beforeAll(async () => {
    // Create a test project for backup tests
    const res = await jsonRequest("POST", "/api/projects", {
      name: "Backup Test Project",
    });
    const body = (await res.json()) as { id: string };
    testProjectId = body.id;
  });

  test("GET /api/backups returns paginated response", async () => {
    const res = await fetch(url("/api/backups"));
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      environments: unknown[];
      projects: unknown[];
    };
    expect(body).toHaveProperty("environments");
    expect(body).toHaveProperty("projects");
  });

  test("POST /api/backups/upload uploads a backup", async () => {
    expect(testProjectId).toBeTruthy();

    const formData = new FormData();
    formData.append("project_id", testProjectId);
    formData.append("environment", "test");
    formData.append(
      "file",
      new Blob(['{"test": "data"}'], { type: "application/json" }),
      "test-backup.json",
    );

    const res = await fetch(url("/api/backups/upload"), {
      method: "POST",
      body: formData,
    });
    expect(res.status).toBe(201);

    const body = (await res.json()) as { id: string };
    expect(body.id).toBeTruthy();
    createdBackupId = body.id;
  });

  test("GET /api/backups/:id returns backup detail", async () => {
    expect(createdBackupId).toBeTruthy();

    const res = await fetch(url(`/api/backups/${createdBackupId}`));
    expect(res.status).toBe(200);

    const body = (await res.json()) as { id: string; environment: string };
    expect(body.id).toBe(createdBackupId);
    expect(body.environment).toBe("test");
  });

  test("GET /api/backups/:id/download returns file", async () => {
    expect(createdBackupId).toBeTruthy();

    const res = await fetch(url(`/api/backups/${createdBackupId}/download`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  test("GET /api/backups/:id/preview returns preview data", async () => {
    expect(createdBackupId).toBeTruthy();

    const res = await fetch(url(`/api/backups/${createdBackupId}/preview`));
    // Preview may return 200 or 400 depending on file type
    expect([200, 400]).toContain(res.status);
  });

  test("POST /api/backups/:id/extract extracts backup", async () => {
    expect(createdBackupId).toBeTruthy();

    const res = await jsonRequest(
      "POST",
      `/api/backups/${createdBackupId}/extract`,
    );
    // Extract may succeed or fail based on file format
    expect([200, 400]).toContain(res.status);
  });

  test("GET /api/backups/:id/restore-command returns command", async () => {
    expect(createdBackupId).toBeTruthy();

    const res = await fetch(
      url(`/api/backups/${createdBackupId}/restore-command`),
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as { command: string };
    expect(typeof body.command).toBe("string");
  });

  test("DELETE /api/backups/:id deletes single backup", async () => {
    expect(createdBackupId).toBeTruthy();

    const res = await jsonRequest(
      "DELETE",
      `/api/backups/${createdBackupId}`,
    );
    expect(res.status).toBe(200);

    // Verify deletion
    const verify = await fetch(url(`/api/backups/${createdBackupId}`));
    expect(verify.status).toBe(404);
  });

  test("DELETE /api/backups batch deletes backups", async () => {
    // Create another backup for batch delete test
    const formData = new FormData();
    formData.append("project_id", testProjectId);
    formData.append("environment", "test");
    formData.append(
      "file",
      new Blob(['{"batch": "test"}'], { type: "application/json" }),
      "batch-backup.json",
    );

    const createRes = await fetch(url("/api/backups/upload"), {
      method: "POST",
      body: formData,
    });
    const created = (await createRes.json()) as { id: string };

    const res = await jsonRequest("DELETE", "/api/backups", {
      ids: [created.id],
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { deleted: number };
    expect(body.deleted).toBe(1);
  });
});
