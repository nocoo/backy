import { Hono } from "hono";
import {
  listProjectsHandler,
  createProjectHandler,
  getProjectHandler,
  updateProjectHandler,
  deleteProjectHandler,
  regenerateTokenHandler,
  projectPromptHandler,
} from "@backy/api/handlers/projects";
import { buildBaseUrl } from "@backy/api/hosts";
import type { AppEnv } from "../lib/types";
import { toResponse } from "../lib/handler-response";

const app = new Hono<AppEnv>();

app.get("/", async (c) => toResponse(await listProjectsHandler(c.get("ctx"))));
app.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return toResponse(await createProjectHandler({ body }, c.get("ctx")));
});
app.get("/:id", async (c) =>
  toResponse(await getProjectHandler({ id: c.req.param("id") }, c.get("ctx"))),
);
app.put("/:id", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return toResponse(
    await updateProjectHandler({ id: c.req.param("id"), body }, c.get("ctx")),
  );
});
app.delete("/:id", async (c) =>
  toResponse(
    await deleteProjectHandler({ id: c.req.param("id") }, c.get("ctx")),
  ),
);
app.post("/:id/token", async (c) =>
  toResponse(
    await regenerateTokenHandler({ id: c.req.param("id") }, c.get("ctx")),
  ),
);
app.get("/:id/prompt", async (c) => {
  const ctx = c.get("ctx");
  const baseUrl = buildBaseUrl(c.req.raw, ctx.env);
  return toResponse(
    await projectPromptHandler({ id: c.req.param("id"), baseUrl }, ctx),
  );
});

export { app as projectsRoutes };
