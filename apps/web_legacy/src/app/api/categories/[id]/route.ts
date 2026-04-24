import {
  getCategoryHandler,
  updateCategoryHandler,
  deleteCategoryHandler,
} from "@backy/api/handlers/categories";
import { toResponse } from "@/lib/http";
import { getCtx } from "@/lib/runtime";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return toResponse(await getCategoryHandler({ id }, getCtx()));
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    console.error("Failed to update category:", error);
    return Response.json(
      { error: "Failed to update category" },
      { status: 500 },
    );
  }
  return toResponse(await updateCategoryHandler({ id, body }, getCtx()));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return toResponse(await deleteCategoryHandler({ id }, getCtx()));
}
