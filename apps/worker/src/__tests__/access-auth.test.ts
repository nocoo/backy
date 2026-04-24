import { describe, expect, test, beforeEach } from "bun:test";
import { Hono } from "hono";
import {
  accessAuth,
  __resetJwksCacheForTests,
} from "../middleware/access-auth";
import type { AppEnv } from "../lib/types";

function buildApp() {
  const app = new Hono<AppEnv>();
  app.use("*", accessAuth);
  app.all("*", (c) =>
    c.json({ ok: true, email: c.get("accessEmail") ?? null }),
  );
  return app;
}

beforeEach(() => __resetJwksCacheForTests());

describe("accessAuth — public path whitelist", () => {
  test("GET /api/live is public", async () => {
    const res = await buildApp().request("/api/live", {
      headers: { host: "backy.example.com" },
    });
    expect(res.status).toBe(200);
  });

  test("POST /api/cron/trigger is public", async () => {
    const res = await buildApp().request("/api/cron/trigger", {
      method: "POST",
      headers: { host: "backy.example.com" },
    });
    expect(res.status).toBe(200);
  });

  test("HEAD /api/webhook/:projectId is public", async () => {
    const res = await buildApp().request("/api/webhook/abc", {
      method: "HEAD",
      headers: { host: "backy.example.com" },
    });
    expect(res.status).toBe(200);
  });

  test("GET /api/webhook/:projectId is public", async () => {
    const res = await buildApp().request("/api/webhook/abc", {
      headers: { host: "backy.example.com" },
    });
    expect(res.status).toBe(200);
  });

  test("POST /api/webhook/:projectId is public", async () => {
    const res = await buildApp().request("/api/webhook/abc", {
      method: "POST",
      headers: { host: "backy.example.com" },
    });
    expect(res.status).toBe(200);
  });

  test("GET /api/restore/:id is public", async () => {
    const res = await buildApp().request("/api/restore/xyz", {
      headers: { host: "backy.example.com" },
    });
    expect(res.status).toBe(200);
  });

  test("/api/cron/trigger/:projectId is NOT public (Access-protected)", async () => {
    const res = await buildApp().request("/api/cron/trigger/abc", {
      method: "POST",
      headers: { host: "backy.example.com" },
    });
    expect(res.status).toBe(500); // Access not configured → 500
  });

  test("/api/webhook/:projectId/sub is NOT public (only one segment after webhook/)", async () => {
    const res = await buildApp().request("/api/webhook/abc/sub", {
      headers: { host: "backy.example.com" },
    });
    expect(res.status).toBe(500);
  });

  test("/api/restore/:id/sub is NOT public", async () => {
    const res = await buildApp().request("/api/restore/abc/sub", {
      headers: { host: "backy.example.com" },
    });
    expect(res.status).toBe(500);
  });
});

describe("accessAuth — short-circuits", () => {
  test("E2E_SKIP_AUTH bypass sets dev email", async () => {
    const app = buildApp();
    const res = await app.request(
      "/api/projects",
      { headers: { host: "backy.example.com" } },
      { E2E_SKIP_AUTH: "true" } as unknown as AppEnv["Bindings"],
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual({ ok: true, email: "dev@local" });
  });

  test("localhost bypass sets dev email", async () => {
    const res = await buildApp().request("/api/projects", {
      headers: { host: "localhost:7018" },
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual({ ok: true, email: "dev@local" });
  });
});

describe("accessAuth — unconfigured env", () => {
  test("returns 500 when CF_ACCESS_* env missing", async () => {
    const res = await buildApp().request("/api/projects", {
      headers: { host: "backy.example.com" },
    });
    expect(res.status).toBe(500);
    expect((await res.json()) as unknown).toEqual({
      error: "Cloudflare Access not configured",
    });
  });
});

describe("accessAuth — JWT verification", () => {
  test("missing Cf-Access-Jwt-Assertion → 401", async () => {
    const app = buildApp();
    const res = await app.request(
      "/api/projects",
      { headers: { host: "backy.example.com" } },
      {
        CF_ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
        CF_ACCESS_AUD: "test-aud",
      } as unknown as AppEnv["Bindings"],
    );
    expect(res.status).toBe(401);
  });

  test("invalid JWT → 401", async () => {
    const app = buildApp();
    const res = await app.request(
      "/api/projects",
      {
        headers: {
          host: "backy.example.com",
          "Cf-Access-Jwt-Assertion": "not-a-real-jwt",
        },
      },
      {
        CF_ACCESS_TEAM_DOMAIN: "nonexistent.example.com",
        CF_ACCESS_AUD: "test-aud",
      } as unknown as AppEnv["Bindings"],
    );
    expect(res.status).toBe(401);
  });
});
