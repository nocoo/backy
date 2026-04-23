import { liveCheckHandler } from "@backy/api/handlers/live";
import { toResponse } from "@/lib/http";

export async function GET() {
  return toResponse(await liveCheckHandler());
}
