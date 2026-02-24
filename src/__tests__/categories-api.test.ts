import { describe, expect, test, beforeEach, mock } from "bun:test";
import type { Category } from "@/lib/db/categories";

// --- Mutable mock state ---

const mockCategory: Category = {
  id: "cat-1",
  name: "Backend",
  color: "#3b82f6",
  icon: "server",
  sort_order: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

let mockListResult: Category[] = [mockCategory];
let mockGetResult: Category | undefined = mockCategory;
let mockCreateResult: Category = mockCategory;
let mockUpdateResult: Category | undefined = mockCategory;
let mockDeleteResult = true;

mock.module("@/lib/db/categories", () => ({
  listCategories: async () => mockListResult,
  getCategory: async () => mockGetResult,
  createCategory: async (data: { name: string; color?: string; icon?: string; sortOrder?: number }) =>
    ({ ...mockCreateResult, name: data.name, color: data.color ?? "#6b7280", icon: data.icon ?? "folder" }),
  updateCategory: async () => mockUpdateResult,
  deleteCategory: async () => mockDeleteResult,
}));

// Import routes AFTER mocks
const { GET: listGET, POST } = await import("@/app/api/categories/route");
const { GET: getGET, PUT, DELETE: routeDELETE } = await import("@/app/api/categories/[id]/route");

// --- Helpers ---

function jsonRequest(body: unknown, method = "POST"): Request {
  return new Request("http://localhost:7026/api/categories", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/categories", () => {
  beforeEach(() => {
    mockListResult = [mockCategory];
  });

  test("returns list of categories", async () => {
    const res = await listGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("cat-1");
    expect(body[0].name).toBe("Backend");
  });

  test("returns empty array when no categories exist", async () => {
    mockListResult = [];
    const res = await listGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });
});

describe("POST /api/categories", () => {
  beforeEach(() => {
    mockCreateResult = mockCategory;
  });

  test("creates a category with valid data and returns 201", async () => {
    const req = jsonRequest({ name: "Frontend", color: "#ef4444", icon: "layout", sortOrder: 1 });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Frontend");
    expect(body.color).toBe("#ef4444");
    expect(body.icon).toBe("layout");
  });

  test("creates a category with only name (defaults for rest)", async () => {
    const req = jsonRequest({ name: "Minimal" });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Minimal");
    expect(body.color).toBe("#6b7280");
    expect(body.icon).toBe("folder");
  });

  test("rejects empty name with 400", async () => {
    const req = jsonRequest({ name: "" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid input");
  });

  test("rejects name exceeding 50 characters with 400", async () => {
    const req = jsonRequest({ name: "A".repeat(51) });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("rejects invalid color format with 400", async () => {
    const req = jsonRequest({ name: "Bad Color", color: "red" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid input");
  });

  test("rejects color without hash prefix with 400", async () => {
    const req = jsonRequest({ name: "No Hash", color: "ff0000" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("rejects negative sortOrder with 400", async () => {
    const req = jsonRequest({ name: "Bad Sort", sortOrder: -1 });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("rejects non-integer sortOrder with 400", async () => {
    const req = jsonRequest({ name: "Float Sort", sortOrder: 1.5 });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("rejects missing name field with 400", async () => {
    const req = jsonRequest({ color: "#ff0000" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/categories/[id]", () => {
  beforeEach(() => {
    mockGetResult = mockCategory;
  });

  test("returns a single category by ID", async () => {
    const req = new Request("http://localhost:7026/api/categories/cat-1");
    const params = Promise.resolve({ id: "cat-1" });
    const res = await getGET(req, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("cat-1");
    expect(body.name).toBe("Backend");
  });

  test("returns 404 when category not found", async () => {
    mockGetResult = undefined;
    const req = new Request("http://localhost:7026/api/categories/nonexistent");
    const params = Promise.resolve({ id: "nonexistent" });
    const res = await getGET(req, { params });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });
});

describe("PUT /api/categories/[id]", () => {
  beforeEach(() => {
    mockUpdateResult = { ...mockCategory, name: "Updated" };
  });

  test("updates a category with valid data and returns 200", async () => {
    const req = new Request("http://localhost:7026/api/categories/cat-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated", color: "#10b981" }),
    });
    const params = Promise.resolve({ id: "cat-1" });
    const res = await PUT(req, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Updated");
  });

  test("returns 404 when updating nonexistent category", async () => {
    mockUpdateResult = undefined;
    const req = new Request("http://localhost:7026/api/categories/nonexistent", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Nope" }),
    });
    const params = Promise.resolve({ id: "nonexistent" });
    const res = await PUT(req, { params });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  test("rejects invalid color format with 400", async () => {
    const req = new Request("http://localhost:7026/api/categories/cat-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color: "not-a-color" }),
    });
    const params = Promise.resolve({ id: "cat-1" });
    const res = await PUT(req, { params });
    expect(res.status).toBe(400);
  });

  test("rejects empty name with 400", async () => {
    const req = new Request("http://localhost:7026/api/categories/cat-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    const params = Promise.resolve({ id: "cat-1" });
    const res = await PUT(req, { params });
    expect(res.status).toBe(400);
  });

  test("accepts partial updates (only icon)", async () => {
    mockUpdateResult = { ...mockCategory, icon: "star" };
    const req = new Request("http://localhost:7026/api/categories/cat-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ icon: "star" }),
    });
    const params = Promise.resolve({ id: "cat-1" });
    const res = await PUT(req, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.icon).toBe("star");
  });
});

describe("DELETE /api/categories/[id]", () => {
  beforeEach(() => {
    mockDeleteResult = true;
  });

  test("deletes an existing category and returns 200", async () => {
    const req = new Request("http://localhost:7026/api/categories/cat-1", { method: "DELETE" });
    const params = Promise.resolve({ id: "cat-1" });
    const res = await routeDELETE(req, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("returns 404 when deleting nonexistent category", async () => {
    mockDeleteResult = false;
    const req = new Request("http://localhost:7026/api/categories/nonexistent", { method: "DELETE" });
    const params = Promise.resolve({ id: "nonexistent" });
    const res = await routeDELETE(req, { params });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });
});
