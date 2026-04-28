import { Hono } from "hono";
import {
  dbInitHandler,
  getTestMarkerHandler,
  seedTestProjectHandler,
} from "@backy/api/handlers/db";
import type { AppEnv } from "../lib/types";
import { toResponse } from "../lib/handler-response";

const app = new Hono<AppEnv>();

app.post("/init", async (c) => toResponse(await dbInitHandler(c.get("ctx"))));
app.get("/init/marker", async (c) =>
  toResponse(await getTestMarkerHandler(c.get("ctx"))),
);
app.post("/seed-test-project", async (c) =>
  toResponse(await seedTestProjectHandler(c.get("ctx"))),
);

export { app as dbRoutes };
