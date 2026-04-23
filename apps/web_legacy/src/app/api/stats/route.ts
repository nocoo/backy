import { statsTotalsHandler } from "@backy/api/handlers/stats";
import { toResponse } from "@/lib/http";

export async function GET() {
  return toResponse(await statsTotalsHandler());
}
