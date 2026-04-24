import { Hono } from "hono";
import {
  listWebhookLogsHandler,
  deleteWebhookLogsHandler,
  listCronLogsHandler,
  deleteCronLogsHandler,
} from "@backy/api/handlers/logs";
import type { AppEnv } from "../lib/types";
import { toResponse } from "../lib/handler-response";

const app = new Hono<AppEnv>();

app.get("/webhook", async (c) => {
  const q = c.req.query();
  return toResponse(
    await listWebhookLogsHandler(
      {
        projectId: q.projectId ?? null,
        excludeProjectIds: q.excludeProjectIds ?? null,
        excludeClientIps: q.excludeClientIps ?? null,
        method: q.method ?? null,
        statusCode: q.statusCode ?? null,
        errorCode: q.errorCode ?? null,
        success: q.success ?? null,
      },
      c.get("ctx"),
    ),
  );
});

app.delete("/webhook", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return toResponse(await deleteWebhookLogsHandler({ body }, c.get("ctx")));
});

app.get("/cron", async (c) => {
  const q = c.req.query();
  return toResponse(
    await listCronLogsHandler(
      {
        projectId: q.projectId ?? null,
        status: q.status ?? null,
        page: q.page ?? null,
        pageSize: q.pageSize ?? null,
      },
      c.get("ctx"),
    ),
  );
});

app.delete("/cron", async (c) => {
  const q = c.req.query();
  return toResponse(
    await deleteCronLogsHandler(
      { projectId: q.projectId ?? null, status: q.status ?? null },
      c.get("ctx"),
    ),
  );
});

export { app as logsRoutes };
