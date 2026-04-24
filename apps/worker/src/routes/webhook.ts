import { Hono } from "hono";
import {
  webhookHeadHandler,
  webhookGetHandler,
  webhookPostHandler,
} from "@backy/api/handlers/webhook";
import type { AppEnv } from "../lib/types";
import { toResponse, clientIpOf } from "../lib/handler-response";

const app = new Hono<AppEnv>();

function commonInput(c: {
  req: { param(k: string): string; header(k: string): string | undefined; raw: Request };
}) {
  return {
    projectId: c.req.param("projectId"),
    authorization: c.req.header("authorization") ?? null,
    clientIp: clientIpOf(c.req.raw),
    userAgent: c.req.header("user-agent") ?? null,
  };
}

app.on("HEAD", "/:projectId", async (c) =>
  toResponse(await webhookHeadHandler(commonInput(c), c.get("ctx"))),
);

app.get("/:projectId", async (c) => {
  const env = c.req.query("environment");
  return toResponse(
    await webhookGetHandler(
      {
        ...commonInput(c),
        ...(env !== undefined && { environment: env }),
      },
      c.get("ctx"),
    ),
  );
});

app.post("/:projectId", async (c) =>
  toResponse(
    await webhookPostHandler(
      {
        ...commonInput(c),
        formData: () => c.req.formData(),
      },
      c.get("ctx"),
    ),
  ),
);

export { app as webhookRoutes };
