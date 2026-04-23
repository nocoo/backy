import { downloadBackupHandler } from "@backy/api/handlers/backups";
import { toResponse } from "@/lib/http";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return toResponse(await downloadBackupHandler({ id }));
}
