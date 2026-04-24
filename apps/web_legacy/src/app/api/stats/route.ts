import { statsTotalsHandler } from "@backy/api/handlers/stats";
import { toResponse } from "@/lib/http";
import { getCtx } from "@/lib/runtime";

export async function GET() {
  return toResponse(await statsTotalsHandler(getCtx()));
}
