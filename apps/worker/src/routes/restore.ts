import { Hono } from "hono";
import { restoreHandler } from "@backy/api/handlers/restore";
import type { AppEnv } from "../lib/types";
import { toResponse, clientIpOf } from "../lib/handler-response";

const app = new Hono<AppEnv>();

app.get("/:id", async (c) =>
  toResponse(
    await restoreHandler(
      {
        id: c.req.param("id"),
        authorization: c.req.header("authorization") ?? null,
        clientIp: clientIpOf(c.req.raw),
      },
      c.get("ctx"),
    ),
  ),
);

export { app as restoreRoutes };
