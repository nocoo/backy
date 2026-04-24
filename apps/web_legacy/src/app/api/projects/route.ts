import {
  listProjectsHandler,
  createProjectHandler,
} from "@backy/api/handlers/projects";
import { toResponse } from "@/lib/http";
import { getCtx } from "@/lib/runtime";

export async function GET() {
  return toResponse(await listProjectsHandler(getCtx()));
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    console.error("Failed to create project:", error);
    return Response.json(
      { error: "Failed to create project" },
      { status: 500 },
    );
  }
  return toResponse(await createProjectHandler({ body }, getCtx()));
}
