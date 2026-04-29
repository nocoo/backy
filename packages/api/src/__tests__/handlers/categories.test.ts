import { describe, expect, test, beforeEach, vi } from "vitest";
import { makeMockCtx } from "../helpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockListCategories: () => Promise<any[]> = async () => [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockCreateCategory: (...args: any[]) => Promise<any> = async () => ({});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockGetCategory: (id: string) => Promise<any> = async () => undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockUpdateCategory: (...args: any[]) => Promise<any> = async () => undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockDeleteCategory: (id: string) => Promise<any> = async () => false;

function skipDb<T extends unknown[], R>(fn: (...args: T) => R) {
  return (...args: [unknown, ...T]) => fn(...(args.slice(1) as T));
}

vi.doMock("../../lib/db/categories", () => ({
  listCategories: () => mockListCategories(),
  createCategory: skipDb((...args: unknown[]) => mockCreateCategory(...args)),
  getCategory: skipDb((id: string) => mockGetCategory(id)),
  updateCategory: skipDb((...args: unknown[]) => mockUpdateCategory(...args)),
  deleteCategory: skipDb((id: string) => mockDeleteCategory(id)),
}));

const {
  listCategoriesHandler,
  createCategoryHandler,
  getCategoryHandler,
  updateCategoryHandler,
  deleteCategoryHandler,
} = await import("../../handlers/categories");

const ctx = makeMockCtx();

describe("categories handlers", () => {
  beforeEach(() => {
    mockListCategories = async () => [];
    mockCreateCategory = async () => ({});
    mockGetCategory = async () => undefined;
    mockUpdateCategory = async () => undefined;
    mockDeleteCategory = async () => false;
  });

  test("list returns 200 with rows", async () => {
    mockListCategories = async () => [{ id: "c1", name: "Web" }];
    const r = await listCategoriesHandler(ctx);
    expect(r.status).toBe(200);
    expect(r.kind).toBe("json");
    // Tightened: handler must pass listCategories rows through verbatim
    // (no sanitization, no extra envelope).
    expect((r as { body: unknown }).body).toEqual([{ id: "c1", name: "Web" }]);
  });

  test("list 500 on error", async () => {
    mockListCategories = async () => {
      throw new Error("db");
    };
    const r = await listCategoriesHandler(ctx);
    expect(r.status).toBe(500);
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      expect(r.body).toEqual({ error: "Failed to list categories" });
  });

  test("create 201 with valid input", async () => {
    let captured: unknown;
    mockCreateCategory = async (data: unknown) => {
      captured = data;
      return { id: "c1" };
    };
    const r = await createCategoryHandler(
      { body: { name: "Web", color: "#ffaabb", icon: "globe" } },
      ctx,
    );
    expect(r.status).toBe(201);
    expect(r.kind).toBe("json");
    expect((r as { body: unknown }).body).toEqual({ id: "c1" });
    // Tightened: ALSO verify the parsed input is forwarded to
    // createCategory verbatim. Catches a regression that drops or
    // typos any of the optional fields (color/icon/sortOrder), which
    // the 201 status alone would not detect.
    expect(captured).toEqual({
      name: "Web",
      color: "#ffaabb",
      icon: "globe",
    });
  });

  test("create 400 invalid color", async () => {
    const r = await createCategoryHandler(
      { body: { name: "X", color: "red" } },
      ctx,
    );
    expect(r.status).toBe(400);
    expect(r.kind).toBe("json");
    // 'red' is not a valid hex color; the color field should surface
    // in fieldErrors.
    expect((r as { body: unknown }).body).toMatchObject({
      error: "Invalid input",
      details: {
        fieldErrors: { color: expect.arrayContaining([expect.any(String)]) },
      },
    });
  });

  test("create 400 missing name", async () => {
    expect(
      (await createCategoryHandler({ body: {} }, ctx)).status,
    ).toBe(400);
  });

  test("create 500 on db error", async () => {
    mockCreateCategory = async () => {
      throw new Error("db");
    };
    const r = await createCategoryHandler({ body: { name: "X" } }, ctx);
    expect(r.status).toBe(500);
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      expect(r.body).toEqual({ error: "Failed to create category" });
  });

  test("get 200 when found", async () => {
    mockGetCategory = async () => ({ id: "c1", name: "Web" });
    const r = await getCategoryHandler({ id: "c1" }, ctx);
    expect(r.status).toBe(200);
    expect(r.kind).toBe("json");
    expect((r as { body: unknown }).body).toEqual({ id: "c1", name: "Web" });
  });

  test("get 404 when missing", async () => {
    const r = await getCategoryHandler({ id: "c1" }, ctx);
    expect(r.status).toBe(404);
    expect(r.kind).toBe("json");
    expect((r as { body: unknown }).body).toEqual({ error: "Category not found" });
  });

  test("get 500 on db error", async () => {
    mockGetCategory = async () => {
      throw new Error("db");
    };
    const r = await getCategoryHandler({ id: "c1" }, ctx);
    expect(r.status).toBe(500);
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      expect(r.body).toEqual({ error: "Failed to get category" });
  });

  test("update 200 when patched", async () => {
    mockUpdateCategory = async () => ({ id: "c1", name: "X" });
    const r = await updateCategoryHandler({ id: "c1", body: { name: "X" } }, ctx);
    expect(r.status).toBe(200);
    expect(r.kind).toBe("json");
    expect((r as { body: unknown }).body).toEqual({ id: "c1", name: "X" });
  });

  test("update 400 invalid input", async () => {
    const r = await updateCategoryHandler(
      { id: "c1", body: { color: "red" } },
      ctx,
    );
    expect(r.status).toBe(400);
    expect(r.kind).toBe("json");
    expect((r as { body: unknown }).body).toMatchObject({
      error: "Invalid input",
      details: {
        fieldErrors: { color: expect.arrayContaining([expect.any(String)]) },
      },
    });
  });

  test("update 404 when missing", async () => {
    const r = await updateCategoryHandler({ id: "c1", body: { name: "X" } }, ctx);
    expect(r.status).toBe(404);
    expect(r.kind).toBe("json");
    expect((r as { body: unknown }).body).toEqual({ error: "Category not found" });
  });

  test("update 500 on db error", async () => {
    mockUpdateCategory = async () => {
      throw new Error("db");
    };
    const r = await updateCategoryHandler(
      { id: "c1", body: { name: "X" } },
      ctx,
    );
    expect(r.status).toBe(500);
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      expect(r.body).toEqual({ error: "Failed to update category" });
  });

  test("delete 200 when deleted", async () => {
    mockDeleteCategory = async () => true;
    const r = await deleteCategoryHandler({ id: "c1" }, ctx);
    expect(r.status).toBe(200);
    expect(r.kind).toBe("json");
    expect((r as { body: unknown }).body).toEqual({ success: true });
  });

  test("delete 404 when missing", async () => {
    const r = await deleteCategoryHandler({ id: "c1" }, ctx);
    expect(r.status).toBe(404);
    expect(r.kind).toBe("json");
    expect((r as { body: unknown }).body).toEqual({ error: "Category not found" });
  });

  test("delete 500 on db error", async () => {
    mockDeleteCategory = async () => {
      throw new Error("db");
    };
    const r = await deleteCategoryHandler({ id: "c1" }, ctx);
    expect(r.status).toBe(500);
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      expect(r.body).toEqual({ error: "Failed to delete category" });
  });
});
