/**
 * L2: Projects API E2E tests.
 *
 * Routes covered:
 *   GET    /api/projects
 *   POST   /api/projects
 *   GET    /api/projects/:id
 *   PUT    /api/projects/:id
 *   DELETE /api/projects/:id
 *   POST   /api/projects/:id/token
 *   GET    /api/projects/:id/prompt
 */

import { describe, expect, test, } from "bun:test";
import { url, jsonRequest } from "./config";

describe("L2: API /api/projects", () => {
  let createdProjectId: string;

  test("GET /api/projects returns array", async () => {
    const res = await fetch(url("/api/projects"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("POST /api/projects creates a project", async () => {
    const res = await jsonRequest("POST", "/api/projects", {
      name: "E2E Test Project",
      description: "Created by E2E test",
    });
    expect(res.status).toBe(201);

    const body = (await res.json()) as { id: string; name: string };
    expect(body.name).toBe("E2E Test Project");
    expect(body.id).toBeTruthy();
    createdProjectId = body.id;
  });

  test("GET /api/projects/:id returns project detail", async () => {
    expect(createdProjectId).toBeTruthy();

    const res = await fetch(url(`/api/projects/${createdProjectId}`));
    expect(res.status).toBe(200);

    const body = (await res.json()) as { id: string; name: string };
    expect(body.id).toBe(createdProjectId);
    expect(body.name).toBe("E2E Test Project");
  });

  test("PUT /api/projects/:id updates project", async () => {
    expect(createdProjectId).toBeTruthy();

    const res = await jsonRequest("PUT", `/api/projects/${createdProjectId}`, {
      name: "E2E Test Project Updated",
      description: "Updated by E2E test",
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { id: string; name: string };
    expect(body.name).toBe("E2E Test Project Updated");
  });

  test("POST /api/projects/:id/token regenerates webhook token", async () => {
    expect(createdProjectId).toBeTruthy();

    const res = await jsonRequest(
      "POST",
      `/api/projects/${createdProjectId}/token`,
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as { webhook_token: string };
    expect(body.webhook_token).toBeTruthy();
    expect(typeof body.webhook_token).toBe("string");
  });

  test("GET /api/projects/:id/prompt returns prompt text", async () => {
    expect(createdProjectId).toBeTruthy();

    const res = await fetch(url(`/api/projects/${createdProjectId}/prompt`));
    expect(res.status).toBe(200);

    const body = (await res.json()) as { prompt: string };
    expect(typeof body.prompt).toBe("string");
  });

  test("DELETE /api/projects/:id deletes project", async () => {
    expect(createdProjectId).toBeTruthy();

    const res = await jsonRequest(
      "DELETE",
      `/api/projects/${createdProjectId}`,
    );
    expect(res.status).toBe(200);

    // Verify deletion
    const verify = await fetch(url(`/api/projects/${createdProjectId}`));
    expect(verify.status).toBe(404);
  });
});
