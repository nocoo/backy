import { Hono } from "hono";
import {
  cronTriggerHandler,
  cronTriggerOneHandler,
} from "@backy/api/handlers/cron";
import type { AppEnv } from "../lib/types";
import { toResponse } from "../lib/handler-response";

const app = new Hono<AppEnv>();

app.post("/trigger", async (c) =>
  toResponse(
    await cronTriggerHandler(
      { authorization: c.req.header("authorization") ?? null },
      c.get("ctx"),
    ),
  ),
);

app.post("/trigger/:projectId", async (c) =>
  toResponse(
    await cronTriggerOneHandler(
      { projectId: c.req.param("projectId") },
      c.get("ctx"),
    ),
  ),
);

export { app as cronRoutes };
