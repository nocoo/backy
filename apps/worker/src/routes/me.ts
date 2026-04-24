import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

const app = new Hono<AppEnv>();

app.get("/", (c) => {
  const email = c.get("accessEmail");
  if (!email) {
    return c.json({ authenticated: false }, 401);
  }
  return c.json({ authenticated: true, email });
});

export { app as meRoutes };
