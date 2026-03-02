/**
 * Suite: Category CRUD Lifecycle — create, read, update, assign, delete cascade
 */

import { test, assert, assertEqual } from "../framework";
import { state, PROJECT_ID } from "../config";

export async function suiteCategoryCrud(): Promise<void> {
  console.log("\n📋 Suite: Category CRUD Lifecycle");

  let categoryId = "";

  // Step 1: Create a category
  await test("GIVEN valid category data WHEN creating via POST THEN returns 201 with category object", async () => {
    const res = await fetch(`${state.baseUrl}/api/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "E2E Test Category", color: "#ef4444", icon: "shield" }),
    });
    assertEqual(res.status, 201, "status");
    const body = await res.json();
    assert(typeof body.id === "string" && body.id.length > 0, "id should be a non-empty string");
    assertEqual(body.name, "E2E Test Category", "name");
    assertEqual(body.color, "#ef4444", "color");
    assertEqual(body.icon, "shield", "icon");
    assertEqual(body.sort_order, 0, "sort_order default");
    categoryId = body.id;
    state.createdCategoryIds.push(categoryId);
  });

  // Step 2: Verify category appears in list
  await test("GIVEN a created category WHEN listing all categories THEN the new category appears", async () => {
    const res = await fetch(`${state.baseUrl}/api/categories`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(Array.isArray(body), "response should be an array");
    const found = body.find((c: { id: string }) => c.id === categoryId);
    assert(found !== undefined, "category should appear in list");
    assertEqual(found.name, "E2E Test Category", "name");
  });

  // Step 3: Get category by ID
  await test("GIVEN a created category WHEN getting by ID THEN returns full category data", async () => {
    const res = await fetch(`${state.baseUrl}/api/categories/${categoryId}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.id, categoryId, "id");
    assertEqual(body.name, "E2E Test Category", "name");
    assertEqual(body.color, "#ef4444", "color");
    assertEqual(body.icon, "shield", "icon");
  });

  // Step 4: Update category
  await test("GIVEN a created category WHEN updating name/color/icon THEN returns updated data", async () => {
    const res = await fetch(`${state.baseUrl}/api/categories/${categoryId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "E2E Updated", color: "#10b981", icon: "star" }),
    });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.name, "E2E Updated", "name");
    assertEqual(body.color, "#10b981", "color");
    assertEqual(body.icon, "star", "icon");
  });

  // Step 5: Verify update persisted
  await test("GIVEN an updated category WHEN getting by ID THEN returns updated values", async () => {
    const res = await fetch(`${state.baseUrl}/api/categories/${categoryId}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.name, "E2E Updated", "name");
    assertEqual(body.color, "#10b981", "color");
    assertEqual(body.icon, "star", "icon");
  });

  // Step 6: Assign category to backy-test project
  await test("GIVEN a category and project WHEN assigning category to project THEN project shows category_id", async () => {
    const res = await fetch(`${state.baseUrl}/api/projects/${PROJECT_ID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category_id: categoryId }),
    });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.category_id, categoryId, "category_id");
  });

  // Step 7: Verify project has category
  await test("GIVEN a project with category WHEN getting project THEN category_id is set", async () => {
    const res = await fetch(`${state.baseUrl}/api/projects/${PROJECT_ID}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.category_id, categoryId, "category_id");
  });

  // Step 8: Delete category — should cascade (set project category_id to null)
  await test("GIVEN a category assigned to project WHEN deleting category THEN returns success", async () => {
    const res = await fetch(`${state.baseUrl}/api/categories/${categoryId}`, { method: "DELETE" });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.success, true, "success");
    // Remove from cleanup list since we just deleted it
    const idx = state.createdCategoryIds.indexOf(categoryId);
    if (idx !== -1) state.createdCategoryIds.splice(idx, 1);
  });

  // Step 9: Verify project's category_id is now null (CASCADE ON DELETE SET NULL)
  await test("GIVEN a deleted category WHEN getting project THEN category_id is null", async () => {
    const res = await fetch(`${state.baseUrl}/api/projects/${PROJECT_ID}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.category_id, null, "category_id should be null after category deletion");
  });

  // Step 10: Verify category is gone from list
  await test("GIVEN a deleted category WHEN listing categories THEN it no longer appears", async () => {
    const res = await fetch(`${state.baseUrl}/api/categories`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    const found = body.find((c: { id: string }) => c.id === categoryId);
    assertEqual(found, undefined, "deleted category should not appear in list");
  });

  // Step 11: Verify 404 on GET for deleted category
  await test("GIVEN a deleted category WHEN getting by ID THEN returns 404", async () => {
    const res = await fetch(`${state.baseUrl}/api/categories/${categoryId}`);
    assertEqual(res.status, 404, "status");
  });

  // Step 12: Validation errors
  await test("GIVEN invalid category data WHEN creating THEN returns 400", async () => {
    const res = await fetch(`${state.baseUrl}/api/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "", color: "invalid" }),
    });
    assertEqual(res.status, 400, "status");
  });
}
