import { liveCheckHandler } from "@backy/api/handlers/live";
import { toResponse } from "@/lib/http";
import { getCtx } from "@/lib/runtime";

export async function GET() {
  return toResponse(await liveCheckHandler(getCtx()));
}
