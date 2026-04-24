import { cronTriggerOneHandler } from "@backy/api/handlers/cron";
import { toResponse } from "@/lib/http";
import { getCtx } from "@/lib/runtime";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  return toResponse(await cronTriggerOneHandler({ projectId }, getCtx()));
}
