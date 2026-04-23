import { statsChartsHandler } from "@backy/api/handlers/stats";
import { toResponse } from "@/lib/http";

export async function GET() {
  return toResponse(await statsChartsHandler());
}
