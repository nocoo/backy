import { describe, expect, test, beforeEach, mock } from "bun:test";

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

mock.module("../../lib/db/categories", () => ({
  listCategories: () => mockListCategories(),
  createCategory: (...args: unknown[]) => mockCreateCategory(...args),
  getCategory: (id: string) => mockGetCategory(id),
  updateCategory: (...args: unknown[]) => mockUpdateCategory(...args),
  deleteCategory: (id: string) => mockDeleteCategory(id),
}));

const {
  listCategoriesHandler,
  createCategoryHandler,
  getCategoryHandler,
  updateCategoryHandler,
  deleteCategoryHandler,
} = await import("../../handlers/categories");

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
    const r = await listCategoriesHandler();
    expect(r.status).toBe(200);
  });

  test("list 500 on error", async () => {
    mockListCategories = async () => {
      throw new Error("db");
    };
    expect((await listCategoriesHandler()).status).toBe(500);
  });

  test("create 201 with valid input", async () => {
    mockCreateCategory = async () => ({ id: "c1" });
    const r = await createCategoryHandler({
      body: { name: "Web", color: "#ffaabb", icon: "globe" },
    });
    expect(r.status).toBe(201);
  });

  test("create 400 invalid color", async () => {
    const r = await createCategoryHandler({
      body: { name: "X", color: "red" },
    });
    expect(r.status).toBe(400);
  });

  test("create 400 missing name", async () => {
    expect(
      (await createCategoryHandler({ body: {} })).status,
    ).toBe(400);
  });

  test("create 500 on db error", async () => {
    mockCreateCategory = async () => {
      throw new Error("db");
    };
    expect(
      (await createCategoryHandler({ body: { name: "X" } })).status,
    ).toBe(500);
  });

  test("get 200 when found", async () => {
    mockGetCategory = async () => ({ id: "c1" });
    expect((await getCategoryHandler({ id: "c1" })).status).toBe(200);
  });

  test("get 404 when missing", async () => {
    expect((await getCategoryHandler({ id: "c1" })).status).toBe(404);
  });

  test("get 500 on db error", async () => {
    mockGetCategory = async () => {
      throw new Error("db");
    };
    expect((await getCategoryHandler({ id: "c1" })).status).toBe(500);
  });

  test("update 200 when patched", async () => {
    mockUpdateCategory = async () => ({ id: "c1" });
    expect(
      (await updateCategoryHandler({ id: "c1", body: { name: "X" } })).status,
    ).toBe(200);
  });

  test("update 400 invalid input", async () => {
    expect(
      (
        await updateCategoryHandler({
          id: "c1",
          body: { color: "red" },
        })
      ).status,
    ).toBe(400);
  });

  test("update 404 when missing", async () => {
    expect(
      (await updateCategoryHandler({ id: "c1", body: { name: "X" } })).status,
    ).toBe(404);
  });

  test("update 500 on db error", async () => {
    mockUpdateCategory = async () => {
      throw new Error("db");
    };
    expect(
      (await updateCategoryHandler({ id: "c1", body: { name: "X" } })).status,
    ).toBe(500);
  });

  test("delete 200 when deleted", async () => {
    mockDeleteCategory = async () => true;
    expect((await deleteCategoryHandler({ id: "c1" })).status).toBe(200);
  });

  test("delete 404 when missing", async () => {
    expect((await deleteCategoryHandler({ id: "c1" })).status).toBe(404);
  });

  test("delete 500 on db error", async () => {
    mockDeleteCategory = async () => {
      throw new Error("db");
    };
    expect((await deleteCategoryHandler({ id: "c1" })).status).toBe(500);
  });
});
