import { describe, expect, test, beforeEach } from "vitest";
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
    // Tightened: positively verify the request reached the downstream
    // handler (vs. a 200 response from accessAuth itself). The fake
    // handler returns {ok:true, email:null} when no accessEmail is set
    // — this confirms the public-path matcher SKIPPED Access entirely.
    expect(await res.json()).toEqual({ ok: true, email: null });
  });

  test("POST /api/cron/trigger is public", async () => {
    const res = await buildApp().request("/api/cron/trigger", {
      method: "POST",
      headers: { host: "backy.example.com" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, email: null });
  });

  test("HEAD /api/webhook/:projectId is public", async () => {
    const res = await buildApp().request("/api/webhook/abc", {
      method: "HEAD",
      headers: { host: "backy.example.com" },
    });
    expect(res.status).toBe(200);
    // HEAD responses have no body — just confirm the request reached
    // the downstream (status:200 from fake handler, not 401 from access).
    expect(await res.text()).toBe("");
  });

  test("GET /api/webhook/:projectId is public", async () => {
    const res = await buildApp().request("/api/webhook/abc", {
      headers: { host: "backy.example.com" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, email: null });
  });

  test("POST /api/webhook/:projectId is public", async () => {
    const res = await buildApp().request("/api/webhook/abc", {
      method: "POST",
      headers: { host: "backy.example.com" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, email: null });
  });

  test("GET /api/restore/:id is public", async () => {
    const res = await buildApp().request("/api/restore/xyz", {
      headers: { host: "backy.example.com" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, email: null });
  });

  test("/api/cron/trigger/:projectId is NOT public (Access-protected)", async () => {
    const res = await buildApp().request("/api/cron/trigger/abc", {
      method: "POST",
      headers: { host: "backy.example.com" },
    });
    expect(res.status).toBe(500); // Access not configured → 500
    expect(await res.json()).toEqual({
      error: "Cloudflare Access not configured",
    });
  });

  test("/api/webhook/:projectId/sub is NOT public (only one segment after webhook/)", async () => {
    const res = await buildApp().request("/api/webhook/abc/sub", {
      headers: { host: "backy.example.com" },
    });
    expect(res.status).toBe(500);
    // Same misconfig message — confirms the request reached accessAuth
    // (i.e. the public-path matcher did NOT short-circuit on this path,
    // proving the matcher requires exactly one segment after webhook/).
    expect(await res.json()).toEqual({
      error: "Cloudflare Access not configured",
    });
  });

  test("/api/restore/:id/sub is NOT public", async () => {
    const res = await buildApp().request("/api/restore/abc/sub", {
      headers: { host: "backy.example.com" },
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Cloudflare Access not configured",
    });
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

  test("E2E_SKIP_AUTH=false (string) does NOT bypass", async () => {
    // Security contract: bypass requires the EXACT literal string "true".
    // Common misconfig values like "false", "1", or "yes" must NOT
    // accidentally enable the bypass. Without this test a refactor that
    // does `if (env.E2E_SKIP_AUTH)` (truthy check) would silently open
    // a backdoor in production deploys.
    const res = await buildApp().request(
      "/api/projects",
      { headers: { host: "backy.example.com" } },
      { E2E_SKIP_AUTH: "false" } as unknown as AppEnv["Bindings"],
    );
    expect(res.status).toBe(500); // Falls through to access-not-configured
    expect(await res.json()).toEqual({
      error: "Cloudflare Access not configured",
    });
  });

  test("E2E_SKIP_AUTH=1 (string) does NOT bypass", async () => {
    const res = await buildApp().request(
      "/api/projects",
      { headers: { host: "backy.example.com" } },
      { E2E_SKIP_AUTH: "1" } as unknown as AppEnv["Bindings"],
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Cloudflare Access not configured",
    });
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
    expect(await res.json()).toEqual({ error: "Unauthorized" });
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
    // Same generic 'Unauthorized' for missing-jwt and invalid-jwt
    // (no info leak about WHICH check failed).
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });
});
