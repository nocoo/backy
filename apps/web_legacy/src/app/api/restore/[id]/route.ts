import { restoreHandler } from "@backy/api/handlers/restore";
import { getClientIp } from "@backy/api/ip";
import { toResponse } from "@/lib/http";
import { getCtx } from "@/lib/runtime";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return toResponse(
    await restoreHandler(
      {
        id,
        authorization: request.headers.get("authorization"),
        clientIp: getClientIp(request),
      },
      getCtx(),
    ),
  );
}
