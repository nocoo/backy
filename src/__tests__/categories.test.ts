import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/lib/db/categories";

/** Create a mock fetch that satisfies Bun's typeof fetch (includes preconnect). */
function mockFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): typeof globalThis.fetch {
  const fn = handler as typeof globalThis.fetch;
  fn.preconnect = () => {};
  return fn;
}

/** Create a successful D1 response. */
function d1Success<T>(results: T[] = []) {
  return new Response(
    JSON.stringify({
      success: true,
      result: [{ results, success: true, meta: { changes: 0, last_row_id: 0 } }],
      errors: [],
    }),
    { status: 200 },
  );
}

describe("categories", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("listCategories", () => {
    test("returns all categories ordered by sort_order and name", async () => {
      const mockData = [
        { id: "cat-1", name: "Backend", color: "#3b82f6", icon: "server", sort_order: 0, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
        { id: "cat-2", name: "Frontend", color: "#ef4444", icon: "layout", sort_order: 1, created_at: "2026-01-02T00:00:00.000Z", updated_at: "2026-01-02T00:00:00.000Z" },
      ];

      let capturedBody = "";
      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBody = init?.body as string;
        return d1Success(mockData);
      });

      const result = await listCategories();
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe("cat-1");
      expect(result[1]!.id).toBe("cat-2");

      const body = JSON.parse(capturedBody);
      expect(body.sql).toContain("SELECT * FROM categories ORDER BY sort_order ASC, name ASC");
    });

    test("returns empty array when no categories exist", async () => {
      globalThis.fetch = mockFetch(async () => d1Success([]));

      const result = await listCategories();
      expect(result).toHaveLength(0);
      expect(result).toEqual([]);
    });
  });

  describe("getCategory", () => {
    test("returns a single category by ID", async () => {
      const mockCat = {
        id: "cat-42",
        name: "Infra",
        color: "#10b981",
        icon: "cloud",
        sort_order: 5,
        created_at: "2026-01-15T08:00:00.000Z",
        updated_at: "2026-01-15T08:00:00.000Z",
      };

      let capturedBody = "";
      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBody = init?.body as string;
        return d1Success([mockCat]);
      });

      const result = await getCategory("cat-42");
      expect(result).toBeDefined();
      expect(result!.id).toBe("cat-42");
      expect(result!.name).toBe("Infra");
      expect(result!.color).toBe("#10b981");
      expect(result!.icon).toBe("cloud");

      const body = JSON.parse(capturedBody);
      expect(body.sql).toContain("SELECT * FROM categories WHERE id = ?");
      expect(body.params).toContain("cat-42");
    });

    test("returns undefined when category not found", async () => {
      globalThis.fetch = mockFetch(async () => d1Success([]));

      const result = await getCategory("nonexistent");
      expect(result).toBeUndefined();
    });
  });

  describe("createCategory", () => {
    test("inserts a category with all fields", async () => {
      let capturedBody = "";
      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBody = init?.body as string;
        return d1Success();
      });

      const result = await createCategory({
        name: "DevOps",
        color: "#f59e0b",
        icon: "wrench",
        sortOrder: 3,
      });

      expect(result.name).toBe("DevOps");
      expect(result.color).toBe("#f59e0b");
      expect(result.icon).toBe("wrench");
      expect(result.sort_order).toBe(3);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();

      const body = JSON.parse(capturedBody);
      expect(body.sql).toContain("INSERT INTO categories");
      const params = body.params;
      // params: id, name, color, icon, sort_order, created_at, updated_at
      expect(params[1]).toBe("DevOps");
      expect(params[2]).toBe("#f59e0b");
      expect(params[3]).toBe("wrench");
      expect(params[4]).toBe(3);
    });

    test("uses default color (#6b7280) when not provided", async () => {
      let capturedBody = "";
      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBody = init?.body as string;
        return d1Success();
      });

      const result = await createCategory({ name: "Default Color" });
      expect(result.color).toBe("#6b7280");

      const body = JSON.parse(capturedBody);
      expect(body.params[2]).toBe("#6b7280");
    });

    test("uses default icon (folder) when not provided", async () => {
      let capturedBody = "";
      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBody = init?.body as string;
        return d1Success();
      });

      const result = await createCategory({ name: "Default Icon" });
      expect(result.icon).toBe("folder");

      const body = JSON.parse(capturedBody);
      expect(body.params[3]).toBe("folder");
    });

    test("uses default sortOrder (0) when not provided", async () => {
      let capturedBody = "";
      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBody = init?.body as string;
        return d1Success();
      });

      const result = await createCategory({ name: "Default Sort" });
      expect(result.sort_order).toBe(0);

      const body = JSON.parse(capturedBody);
      expect(body.params[4]).toBe(0);
    });

    test("returns a complete Category object", async () => {
      globalThis.fetch = mockFetch(async () => d1Success());

      const result = await createCategory({ name: "Complete" });
      expect(typeof result.id).toBe("string");
      expect(result.id.length).toBeGreaterThan(0);
      expect(result.name).toBe("Complete");
      expect(result.color).toBe("#6b7280");
      expect(result.icon).toBe("folder");
      expect(result.sort_order).toBe(0);
      expect(result.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result.created_at).toBe(result.updated_at);
    });
  });

  describe("updateCategory", () => {
    test("updates all fields on an existing category", async () => {
      const existingCat = {
        id: "cat-up",
        name: "Old Name",
        color: "#000000",
        icon: "folder",
        sort_order: 0,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      };

      let callCount = 0;
      const capturedBodies: string[] = [];
      globalThis.fetch = mockFetch(async (_input, init) => {
        callCount++;
        capturedBodies.push(init?.body as string);
        if (callCount === 1) {
          // getCategory call
          return d1Success([existingCat]);
        }
        // UPDATE call
        return d1Success();
      });

      const result = await updateCategory("cat-up", {
        name: "New Name",
        color: "#ff0000",
        icon: "star",
        sortOrder: 10,
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe("New Name");
      expect(result!.color).toBe("#ff0000");
      expect(result!.icon).toBe("star");
      expect(result!.sort_order).toBe(10);
      expect(result!.id).toBe("cat-up");
      expect(result!.created_at).toBe("2026-01-01T00:00:00.000Z");
      expect(result!.updated_at).not.toBe("2026-01-01T00:00:00.000Z");

      // Verify UPDATE SQL
      const updateBody = JSON.parse(capturedBodies[1]!);
      expect(updateBody.sql).toContain("UPDATE categories SET");
      expect(updateBody.params).toContain("New Name");
      expect(updateBody.params).toContain("#ff0000");
      expect(updateBody.params).toContain("star");
      expect(updateBody.params).toContain(10);
      expect(updateBody.params).toContain("cat-up");
    });

    test("preserves existing fields when partially updating", async () => {
      const existingCat = {
        id: "cat-partial",
        name: "Keep Me",
        color: "#123456",
        icon: "heart",
        sort_order: 7,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      };

      let callCount = 0;
      globalThis.fetch = mockFetch(async () => {
        callCount++;
        if (callCount === 1) return d1Success([existingCat]);
        return d1Success();
      });

      // Only update name
      const result = await updateCategory("cat-partial", { name: "Updated" });

      expect(result).toBeDefined();
      expect(result!.name).toBe("Updated");
      expect(result!.color).toBe("#123456");   // preserved
      expect(result!.icon).toBe("heart");      // preserved
      expect(result!.sort_order).toBe(7);      // preserved
    });

    test("returns undefined when category does not exist", async () => {
      globalThis.fetch = mockFetch(async () => d1Success([]));

      const result = await updateCategory("nonexistent", { name: "Nope" });
      expect(result).toBeUndefined();
    });
  });

  describe("deleteCategory", () => {
    test("deletes an existing category and returns true", async () => {
      const existingCat = {
        id: "cat-del",
        name: "To Delete",
        color: "#6b7280",
        icon: "folder",
        sort_order: 0,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      };

      let callCount = 0;
      let capturedDeleteBody = "";
      globalThis.fetch = mockFetch(async (_input, init) => {
        callCount++;
        if (callCount === 1) return d1Success([existingCat]);
        capturedDeleteBody = init?.body as string;
        return d1Success();
      });

      const result = await deleteCategory("cat-del");
      expect(result).toBe(true);

      const body = JSON.parse(capturedDeleteBody);
      expect(body.sql).toContain("DELETE FROM categories WHERE id = ?");
      expect(body.params).toContain("cat-del");
    });

    test("returns false when category does not exist", async () => {
      globalThis.fetch = mockFetch(async () => d1Success([]));

      const result = await deleteCategory("nonexistent");
      expect(result).toBe(false);
    });
  });
});
