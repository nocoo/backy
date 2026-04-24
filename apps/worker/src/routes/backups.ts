import { Hono } from "hono";
import {
  listBackupsHandler,
  batchDeleteBackupsHandler,
  getBackupHandler,
  deleteBackupHandler,
  uploadBackupHandler,
  downloadBackupHandler,
  previewBackupHandler,
  extractBackupHandler,
  restoreCommandHandler,
} from "@backy/api/handlers/backups";
import { buildBaseUrl } from "@backy/api/hosts";
import type { AppEnv } from "../lib/types";
import { toResponse } from "../lib/handler-response";

const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  const q = c.req.query();
  return toResponse(
    await listBackupsHandler(
      {
        ...(q.projectId !== undefined && { projectId: q.projectId }),
        ...(q.search !== undefined && { search: q.search }),
        ...(q.environment !== undefined && { environment: q.environment }),
        sortBy: q.sortBy ?? null,
        sortOrder: q.sortOrder ?? null,
        page: q.page ?? null,
        pageSize: q.pageSize ?? null,
      },
      c.get("ctx"),
    ),
  );
});

app.post("/", async (c) => {
  const formData = await c.req.formData();
  return toResponse(await uploadBackupHandler({ formData }, c.get("ctx")));
});

app.post("/batch-delete", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return toResponse(await batchDeleteBackupsHandler({ body }, c.get("ctx")));
});

app.get("/:id", async (c) =>
  toResponse(await getBackupHandler({ id: c.req.param("id") }, c.get("ctx"))),
);
app.delete("/:id", async (c) =>
  toResponse(
    await deleteBackupHandler({ id: c.req.param("id") }, c.get("ctx")),
  ),
);
app.get("/:id/download", async (c) =>
  toResponse(
    await downloadBackupHandler({ id: c.req.param("id") }, c.get("ctx")),
  ),
);
app.get("/:id/preview", async (c) =>
  toResponse(
    await previewBackupHandler({ id: c.req.param("id") }, c.get("ctx")),
  ),
);
app.get("/:id/extract", async (c) =>
  toResponse(
    await extractBackupHandler({ id: c.req.param("id") }, c.get("ctx")),
  ),
);
app.get("/:id/restore-command", async (c) => {
  const ctx = c.get("ctx");
  const baseUrl = buildBaseUrl(c.req.raw, ctx.env);
  return toResponse(
    await restoreCommandHandler({ id: c.req.param("id"), baseUrl }, ctx),
  );
});

export { app as backupsRoutes };
