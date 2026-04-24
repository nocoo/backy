/**
 * @backy/worker — Hono app on Cloudflare Workers.
 *
 * Architecture: every HTTP request flows through (1) `secureHeaders`,
 * (2) `accessAuth` (Cloudflare Access JWT, with explicit public-path
 * whitelist matching docs/07), then (3) `ctxMiddleware` which builds a
 * per-request RuntimeContext from the D1/R2 bindings + env. Routes are
 * thin: they extract input from the Hono context and delegate to
 * `@backy/api/handlers/*`, then translate the framework-agnostic
 * HandlerResponse back into a Fetch Response.
 *
 * `scheduled()` runs the cron trigger directly via the binding path —
 * no HTTP roundtrip, no shared secret check (the binding is authority).
 */

import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import {
  cronTriggerHandler,
  type CronTriggerInput,
} from "@backy/api/handlers/cron";
import {
  createBindingD1Adapter,
  type D1Binding,
} from "@backy/api/db/d1-binding-adapter";
import {
  createBindingR2Adapter,
  type R2Binding,
} from "@backy/api/r2/binding-adapter";
import {
  workerRuntimeInfo,
  type BackyEnv,
  type RuntimeContext,
} from "@backy/api/runtime";
import type { AppEnv, Bindings } from "./lib/types";
import { accessAuth } from "./middleware/access-auth";
import { ctxMiddleware } from "./middleware/ctx";
import { projectsRoutes } from "./routes/projects";
import { categoriesRoutes } from "./routes/categories";
import { backupsRoutes } from "./routes/backups";
import { cronRoutes } from "./routes/cron";
import { logsRoutes } from "./routes/logs";
import { statsRoutes } from "./routes/stats";
import { liveRoutes } from "./routes/live";
import { ipInfoRoutes } from "./routes/ip-info";
import { dbRoutes } from "./routes/db";
import { restoreRoutes } from "./routes/restore";
import { webhookRoutes } from "./routes/webhook";
import { meRoutes } from "./routes/me";

const app = new Hono<AppEnv>();

app.use("*", secureHeaders());
app.use("/api/*", accessAuth);
app.use("/api/*", ctxMiddleware());

app.route("/api/projects", projectsRoutes);
app.route("/api/categories", categoriesRoutes);
app.route("/api/backups", backupsRoutes);
app.route("/api/cron", cronRoutes);
app.route("/api/logs", logsRoutes);
app.route("/api/stats", statsRoutes);
app.route("/api/live", liveRoutes);
app.route("/api/ip-info", ipInfoRoutes);
app.route("/api/db", dbRoutes);
app.route("/api/restore", restoreRoutes);
app.route("/api/webhook", webhookRoutes);
app.route("/api/me", meRoutes);

/**
 * Build a RuntimeContext from raw bindings (no Hono Context). Used by
 * `scheduled()` since the cron event has no request to drive middleware.
 */
function ctxFromBindings(env: Bindings): RuntimeContext {
  const backyEnv: BackyEnv = {
    ...(env.CRON_SECRET !== undefined && { CRON_SECRET: env.CRON_SECRET }),
    ...(env.ALLOWED_HOSTS !== undefined && { ALLOWED_HOSTS: env.ALLOWED_HOSTS }),
    ...(env.SSRF_ALLOWLIST !== undefined && {
      SSRF_ALLOWLIST: env.SSRF_ALLOWLIST,
    }),
    ...(env.ECHO_API_URL !== undefined && { ECHO_API_URL: env.ECHO_API_URL }),
    ...(env.ECHO_API_KEY !== undefined && { ECHO_API_KEY: env.ECHO_API_KEY }),
    ...(env.NEXT_PUBLIC_APP_VERSION !== undefined && {
      NEXT_PUBLIC_APP_VERSION: env.NEXT_PUBLIC_APP_VERSION,
    }),
  };
  return {
    db: createBindingD1Adapter(env.DB as unknown as D1Binding),
    r2: createBindingR2Adapter(env.R2 as unknown as R2Binding),
    env: backyEnv,
    info: workerRuntimeInfo(),
  };
}

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Bindings): Promise<void> {
    // Cron is binding-only: synthesize the Bearer header so the shared
    // handler accepts it without exposing CRON_SECRET on the public HTTP
    // path. If CRON_SECRET isn't configured, the handler returns 500 —
    // we surface that as a thrown error so the platform retries.
    const cronSecret = env.CRON_SECRET;
    if (!cronSecret) {
      throw new Error("CRON_SECRET not configured");
    }
    const ctx = ctxFromBindings(env);
    const input: CronTriggerInput = { authorization: `Bearer ${cronSecret}` };
    const result = await cronTriggerHandler(input, ctx);
    if (result.kind === "json" && result.status >= 400) {
      throw new Error(`cron trigger failed: ${JSON.stringify(result.body)}`);
    }
  },
};
