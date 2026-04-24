import { describe, expect, test } from "bun:test";
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
    expect(body.env).toContain("ECHO_API_URL");
    expect(body.env).toContain("CRON_SECRET");
    expect(body.env).toContain("E2E_SKIP_AUTH");
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
    expect(body.url).toContain("r2.cloudflarestorage.com");
    expect(body.url).toContain("X-Amz-Signature=");
  });
});
