import { dbInitHandler } from "@backy/api/handlers/db";
import { toResponse } from "@/lib/http";
import { getCtx } from "@/lib/runtime";

export async function POST() {
  return toResponse(await dbInitHandler(getCtx()));
}
