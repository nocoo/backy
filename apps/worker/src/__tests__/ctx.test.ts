import { describe, expect, test } from "vitest";
import { Hono } from "hono";
import { ctxMiddleware } from "../middleware/ctx";
import type { AppEnv } from "../lib/types";
import { fakeD1, fakeR2, makeEnv } from "./helpers";

function probe() {
  const app = new Hono<AppEnv>();
  app.use("*", ctxMiddleware());
  app.get("/probe", (c) => {
    const ctx = c.get("ctx");
    return c.json({
      hasDb: typeof ctx.db.query === "function",
      hasR2: typeof ctx.r2.put === "function",
      uptime: ctx.info.uptimeSeconds(),
      env: Object.keys(ctx.env).sort(),
    });
  });
  return app;
}

describe("ctxMiddleware", () => {
  test("builds RuntimeContext from bindings", async () => {
    const env = makeEnv({ ECHO_API_URL: "https://echo.example" });
    const res = await probe().request(
      "/probe",
      undefined,
      env as unknown as AppEnv["Bindings"],
    );
    const body = (await res.json()) as {
      hasDb: boolean;
      hasR2: boolean;
      uptime: number | null;
      env: string[];
    };
    expect(body.hasDb).toBe(true);
    expect(body.hasR2).toBe(true);
    expect(body.uptime).toBeNull();
    // Tightened: pin the FULL set of env keys exposed via ctx.env.
    // pickEnv() in middleware/ctx.ts only forwards a fixed allowlist of
    // string-valued env vars (DB/R2 bindings are intentionally NOT in
    // ctx.env). makeEnv() default + the ECHO_API_URL override yields
    // exactly these 3 keys, sorted. A regression that forwards a binding
    // (e.g. DB) or drops one of these would surface here.
    expect(body.env).toEqual([
      "CRON_SECRET",
      "E2E_SKIP_AUTH",
      "ECHO_API_URL",
    ]);
  });

  test("presignDownload throws when R2 S3 creds absent", async () => {
    const app = new Hono<AppEnv>();
    app.use("*", ctxMiddleware());
    app.get("/sign", async (c) => {
      try {
        await c.get("ctx").r2.presignDownload("k", 60);
        return c.json({ signed: true });
      } catch (e) {
        return c.json({ error: (e as Error).message }, 500);
      }
    });
    const res = await app.request(
      "/sign",
      undefined,
      {
        DB: fakeD1() as unknown as D1Database,
        R2: fakeR2() as unknown as R2Bucket,
      } as unknown as AppEnv["Bindings"],
    );
    expect(res.status).toBe(500);
  });

  test("presignDownload uses S3 fallback when creds present", async () => {
    const app = new Hono<AppEnv>();
    app.use("*", ctxMiddleware());
    app.get("/sign", async (c) => {
      const url = await c.get("ctx").r2.presignDownload("k", 60);
      return c.json({ url });
    });
    const res = await app.request(
      "/sign",
      undefined,
      {
        DB: fakeD1() as unknown as D1Database,
        R2: fakeR2() as unknown as R2Bucket,
        R2_ACCESS_KEY_ID: "id",
        R2_SECRET_ACCESS_KEY: "secret",
        R2_ACCOUNT_ID: "acct",
        R2_BUCKET_NAME: "bucket",
      } as unknown as AppEnv["Bindings"],
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    // Tightened: pin the full URL shape via regex. Only X-Amz-Date and
    // X-Amz-Signature are non-deterministic; everything else (host
    // bucket.<account>.r2.cloudflarestorage.com, key, all SigV4 query
    // params with their fixed values) must match exactly. Catches
    // host/key/SigV4-param drift that the prior 2 toContain checks
    // would have missed.
    expect(body.url).toMatch(
      /^https:\/\/bucket\.acct\.r2\.cloudflarestorage\.com\/k\?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=id%2F\d{8}%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=\d{8}T\d{6}Z&X-Amz-Expires=60&X-Amz-Signature=[0-9a-f]{64}&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject$/,
    );
  });
});
