import { z } from "zod";
import {
  listCategories,
  createCategory,
  getCategory,
  updateCategory,
  deleteCategory,
} from "../lib/db/categories";
import { json, type HandlerResponse } from "../http/response";
import type { RuntimeContext } from "../runtime";

const CreateCategorySchema = z.object({
  name: z.string().min(1).max(50),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  icon: z.string().min(1).max(30).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const UpdateCategorySchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  icon: z.string().min(1).max(30).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export async function listCategoriesHandler(
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  try {
    const categories = await listCategories(ctx.db);
    return json(200, categories);
  } catch (error) {
    console.error("Failed to list categories:", error);
    return json(500, { error: "Failed to list categories" });
  }
}

export async function createCategoryHandler(
  input: { body: unknown },
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  try {
    const parsed = CreateCategorySchema.safeParse(input.body);
    if (!parsed.success) {
      return json(400, {
        error: "Invalid input",
        details: parsed.error.flatten(),
      });
    }
    const category = await createCategory(ctx.db, parsed.data);
    return json(201, category);
  } catch (error) {
    console.error("Failed to create category:", error);
    return json(500, { error: "Failed to create category" });
  }
}

export async function getCategoryHandler(
  input: { id: string },
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  try {
    const category = await getCategory(ctx.db, input.id);
    if (!category) return json(404, { error: "Category not found" });
    return json(200, category);
  } catch (error) {
    console.error("Failed to get category:", error);
    return json(500, { error: "Failed to get category" });
  }
}

export async function updateCategoryHandler(
  input: { id: string; body: unknown },
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  try {
    const parsed = UpdateCategorySchema.safeParse(input.body);
    if (!parsed.success) {
      return json(400, {
        error: "Invalid input",
        details: parsed.error.flatten(),
      });
    }
    const category = await updateCategory(ctx.db, input.id, parsed.data);
    if (!category) return json(404, { error: "Category not found" });
    return json(200, category);
  } catch (error) {
    console.error("Failed to update category:", error);
    return json(500, { error: "Failed to update category" });
  }
}

export async function deleteCategoryHandler(
  input: { id: string },
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  try {
    const deleted = await deleteCategory(ctx.db, input.id);
    if (!deleted) return json(404, { error: "Category not found" });
    return json(200, { success: true });
  } catch (error) {
    console.error("Failed to delete category:", error);
    return json(500, { error: "Failed to delete category" });
  }
}
