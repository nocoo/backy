import {
  listCategoriesHandler,
  createCategoryHandler,
} from "@backy/api/handlers/categories";
import { toResponse } from "@/lib/http";
import { getCtx } from "@/lib/runtime";

export async function GET() {
  return toResponse(await listCategoriesHandler(getCtx()));
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    console.error("Failed to create category:", error);
    return Response.json(
      { error: "Failed to create category" },
      { status: 500 },
    );
  }
  return toResponse(await createCategoryHandler({ body }, getCtx()));
}
