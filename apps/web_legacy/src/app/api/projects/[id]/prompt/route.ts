import { projectPromptHandler } from "@backy/api/handlers/projects";
import { buildBaseUrl } from "@backy/api/hosts";
import { toResponse } from "@/lib/http";
import { getCtx } from "@/lib/runtime";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = getCtx();
  const baseUrl = buildBaseUrl(request, ctx.env);
  return toResponse(await projectPromptHandler({ id, baseUrl }, ctx));
}
