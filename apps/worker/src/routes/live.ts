import { Hono } from "hono";
import { liveCheckHandler } from "@backy/api/handlers/live";
import type { AppEnv } from "../lib/types";
import { toResponse } from "../lib/handler-response";

const app = new Hono<AppEnv>();

app.get("/", async (c) => toResponse(await liveCheckHandler(c.get("ctx"))));

export { app as liveRoutes };
