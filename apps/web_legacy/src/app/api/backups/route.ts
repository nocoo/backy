import {
  listBackupsHandler,
  batchDeleteBackupsHandler,
} from "@backy/api/handlers/backups";
import { toResponse } from "@/lib/http";

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const projectId = sp.get("projectId");
  const search = sp.get("search");
  const environment = sp.get("environment");
  return toResponse(
    await listBackupsHandler({
      ...(projectId && { projectId }),
      ...(search && { search }),
      ...(environment && { environment }),
      sortBy: sp.get("sortBy"),
      sortOrder: sp.get("sortOrder"),
      page: sp.get("page"),
      pageSize: sp.get("pageSize"),
    }),
  );
}

export async function DELETE(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    console.error("Failed to batch delete backups:", error);
    return Response.json(
      { error: "Failed to batch delete backups" },
      { status: 500 },
    );
  }
  return toResponse(await batchDeleteBackupsHandler({ body }));
}
