import { cronTriggerHandler } from "@backy/api/handlers/cron";
import { toResponse } from "@/lib/http";
import { getCtx } from "@/lib/runtime";

export async function POST(request: Request) {
  return toResponse(
    await cronTriggerHandler(
      {
        authorization: request.headers.get("authorization"),
      },
      getCtx(),
    ),
  );
}
