import { NextResponse } from "next/server";
import { listCategories, createCategory } from "@/lib/db/categories";
import { z } from "zod";

const CreateCategorySchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().min(1).max(30).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

/**
 * GET /api/categories — List all categories.
 */
export async function GET() {
  try {
    const categories = await listCategories();
    return NextResponse.json(categories);
  } catch (error) {
    console.error("Failed to list categories:", error);
    return NextResponse.json(
      { error: "Failed to list categories" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/categories — Create a new category.
 */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = CreateCategorySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const category = await createCategory(parsed.data);
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error("Failed to create category:", error);
    return NextResponse.json(
      { error: "Failed to create category" },
      { status: 500 },
    );
  }
}
