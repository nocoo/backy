import { Hono } from "hono";
import { lookupAuthorProfile } from "@backy/api/blog-profile";
import type { AppEnv } from "../lib/types";

const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  const email = c.get("accessEmail");
  if (!email) {
    return c.json({ authenticated: false }, 401);
  }
  const { name, avatar } = await lookupAuthorProfile(email);
  return c.json({ authenticated: true, email, name, avatar });
});

export { app as meRoutes };
