/**
 * L2: Categories API E2E tests.
 *
 * Routes covered:
 *   GET    /api/categories
 *   POST   /api/categories
 *   GET    /api/categories/:id
 *   PUT    /api/categories/:id
 *   DELETE /api/categories/:id
 */

import { describe, expect, test } from "bun:test";
import { url, jsonRequest } from "./config";

describe("L2: API /api/categories", () => {
  let createdCategoryId: string;

  test("GET /api/categories returns array", async () => {
    const res = await fetch(url("/api/categories"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("POST /api/categories creates a category", async () => {
    const res = await jsonRequest("POST", "/api/categories", {
      name: "E2E Test Category",
      color: "#FF5733",
    });
    expect(res.status).toBe(201);

    const body = (await res.json()) as { id: string; name: string };
    expect(body.name).toBe("E2E Test Category");
    expect(body.id).toBeTruthy();
    createdCategoryId = body.id;
  });

  test("GET /api/categories/:id returns category detail", async () => {
    expect(createdCategoryId).toBeTruthy();

    const res = await fetch(url(`/api/categories/${createdCategoryId}`));
    expect(res.status).toBe(200);

    const body = (await res.json()) as { id: string; name: string };
    expect(body.id).toBe(createdCategoryId);
    expect(body.name).toBe("E2E Test Category");
  });

  test("PUT /api/categories/:id updates category", async () => {
    expect(createdCategoryId).toBeTruthy();

    const res = await jsonRequest(
      "PUT",
      `/api/categories/${createdCategoryId}`,
      {
        name: "E2E Test Category Updated",
        color: "#33FF57",
      },
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as { id: string; name: string };
    expect(body.name).toBe("E2E Test Category Updated");
  });

  test("DELETE /api/categories/:id deletes category", async () => {
    expect(createdCategoryId).toBeTruthy();

    const res = await jsonRequest(
      "DELETE",
      `/api/categories/${createdCategoryId}`,
    );
    expect(res.status).toBe(200);

    // Verify deletion
    const verify = await fetch(url(`/api/categories/${createdCategoryId}`));
    expect(verify.status).toBe(404);
  });
});
