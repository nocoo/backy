import { restoreCommandHandler } from "@backy/api/handlers/backups";
import { toResponse } from "@/lib/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return toResponse(await restoreCommandHandler({ id, request }));
}
