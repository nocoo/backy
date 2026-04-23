import { restoreCommandHandler } from "@backy/api/handlers/backups";
import { buildBaseUrl } from "@backy/api/hosts";
import { toResponse } from "@/lib/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const baseUrl = buildBaseUrl(request);
  return toResponse(await restoreCommandHandler({ id, baseUrl }));
}
