import { regenerateTokenHandler } from "@backy/api/handlers/projects";
import { toResponse } from "@/lib/http";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return toResponse(await regenerateTokenHandler({ id }));
}
