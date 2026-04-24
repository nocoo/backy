import { Hono } from "hono";
import { ipInfoHandler } from "@backy/api/handlers/ip-info";
import type { AppEnv } from "../lib/types";
import { toResponse } from "../lib/handler-response";
import { clientIpOf } from "../lib/handler-response";

const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  const ip = c.req.query("ip") ?? clientIpOf(c.req.raw);
  return toResponse(await ipInfoHandler({ ip }, c.get("ctx")));
});

export { app as ipInfoRoutes };
