import {
  getProjectHandler,
  updateProjectHandler,
  deleteProjectHandler,
} from "@backy/api/handlers/projects";
import { toResponse } from "@/lib/http";
import { getCtx } from "@/lib/runtime";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return toResponse(await getProjectHandler({ id }, getCtx()));
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
    console.error("Failed to update project:", error);
    return Response.json(
      { error: "Failed to update project" },
      { status: 500 },
    );
  }
  return toResponse(await updateProjectHandler({ id, body }, getCtx()));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return toResponse(await deleteProjectHandler({ id }, getCtx()));
}
