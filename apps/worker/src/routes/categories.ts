import { Hono } from "hono";
import {
  listCategoriesHandler,
  createCategoryHandler,
  getCategoryHandler,
  updateCategoryHandler,
  deleteCategoryHandler,
} from "@backy/api/handlers/categories";
import type { AppEnv } from "../lib/types";
import { toResponse } from "../lib/handler-response";

const app = new Hono<AppEnv>();

app.get("/", async (c) => toResponse(await listCategoriesHandler(c.get("ctx"))));
app.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return toResponse(await createCategoryHandler({ body }, c.get("ctx")));
});
app.get("/:id", async (c) =>
  toResponse(await getCategoryHandler({ id: c.req.param("id") }, c.get("ctx"))),
);
app.put("/:id", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return toResponse(
    await updateCategoryHandler({ id: c.req.param("id"), body }, c.get("ctx")),
  );
});
app.delete("/:id", async (c) =>
  toResponse(
    await deleteCategoryHandler({ id: c.req.param("id") }, c.get("ctx")),
  ),
);

export { app as categoriesRoutes };
