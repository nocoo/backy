import {
  listWebhookLogsHandler,
  deleteWebhookLogsHandler,
} from "@backy/api/handlers/logs";
import { toResponse } from "@/lib/http";

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  return toResponse(
    await listWebhookLogsHandler({
      projectId: sp.get("projectId"),
      excludeProjectIds: sp.get("excludeProjectIds"),
      excludeClientIps: sp.get("excludeClientIps"),
      method: sp.get("method"),
      statusCode: sp.get("statusCode"),
      errorCode: sp.get("errorCode"),
      success: sp.get("success"),
      page: sp.get("page"),
      pageSize: sp.get("pageSize"),
    }),
  );
}

export async function DELETE(request: Request) {
  const body: unknown = await request.json().catch(() => ({}));
  return toResponse(await deleteWebhookLogsHandler({ body }));
}
