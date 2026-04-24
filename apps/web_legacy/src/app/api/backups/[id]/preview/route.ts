import { previewBackupHandler } from "@backy/api/handlers/backups";
import { toResponse } from "@/lib/http";
import { getCtx } from "@/lib/runtime";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return toResponse(await previewBackupHandler({ id }, getCtx()));
}
