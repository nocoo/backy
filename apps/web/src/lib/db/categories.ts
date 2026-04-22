/**
 * Category database operations.
 */

import { executeD1Query } from "./d1-client";
import { generateId } from "@/lib/id";

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * List all categories, ordered by sort_order ascending then name.
 */
export async function listCategories(): Promise<Category[]> {
  return executeD1Query<Category>(
    "SELECT * FROM categories ORDER BY sort_order ASC, name ASC",
  );
}

/**
 * Get a single category by ID.
 */
export async function getCategory(id: string): Promise<Category | undefined> {
  const rows = await executeD1Query<Category>(
    "SELECT * FROM categories WHERE id = ?",
    [id],
  );
  return rows[0];
}

/**
 * Create a new category.
 */
export async function createCategory(data: {
  name: string;
  color?: string | undefined;
  icon?: string | undefined;
  sortOrder?: number | undefined;
}): Promise<Category> {
  const id = generateId();
  const now = new Date().toISOString();
  const color = data.color ?? "#6b7280";
  const icon = data.icon ?? "folder";
  const sortOrder = data.sortOrder ?? 0;

  await executeD1Query(
    "INSERT INTO categories (id, name, color, icon, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, data.name, color, icon, sortOrder, now, now],
  );

  return { id, name: data.name, color, icon, sort_order: sortOrder, created_at: now, updated_at: now };
}

/**
 * Update a category.
 */
export async function updateCategory(
  id: string,
  data: { name?: string | undefined; color?: string | undefined; icon?: string | undefined; sortOrder?: number | undefined },
): Promise<Category | undefined> {
  const existing = await getCategory(id);
  if (!existing) return undefined;

  const name = data.name ?? existing.name;
  const color = data.color ?? existing.color;
  const icon = data.icon ?? existing.icon;
  const sortOrder = data.sortOrder ?? existing.sort_order;
  const now = new Date().toISOString();

  await executeD1Query(
    "UPDATE categories SET name = ?, color = ?, icon = ?, sort_order = ?, updated_at = ? WHERE id = ?",
    [name, color, icon, sortOrder, now, id],
  );

  return { ...existing, name, color, icon, sort_order: sortOrder, updated_at: now };
}

/**
 * Delete a category by ID. Projects referencing it will have category_id set to NULL.
 */
export async function deleteCategory(id: string): Promise<boolean> {
  const existing = await getCategory(id);
  if (!existing) return false;

  await executeD1Query("DELETE FROM categories WHERE id = ?", [id]);
  return true;
}
