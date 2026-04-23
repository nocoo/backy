import {
  listCronLogsHandler,
  deleteCronLogsHandler,
} from "@backy/api/handlers/logs";
import { toResponse } from "@/lib/http";

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  return toResponse(
    await listCronLogsHandler({
      projectId: sp.get("projectId"),
      status: sp.get("status"),
      page: sp.get("page"),
      pageSize: sp.get("pageSize"),
    }),
  );
}

export async function DELETE(request: Request) {
  const sp = new URL(request.url).searchParams;
  return toResponse(
    await deleteCronLogsHandler({
      projectId: sp.get("projectId"),
      status: sp.get("status"),
    }),
  );
}
