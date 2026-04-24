import { Hono } from "hono";
import {
  statsTotalsHandler,
  statsChartsHandler,
} from "@backy/api/handlers/stats";
import type { AppEnv } from "../lib/types";
import { toResponse } from "../lib/handler-response";

const app = new Hono<AppEnv>();

app.get("/totals", async (c) => toResponse(await statsTotalsHandler(c.get("ctx"))));
app.get("/charts", async (c) => toResponse(await statsChartsHandler(c.get("ctx"))));

export { app as statsRoutes };
