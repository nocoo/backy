import { describe, expect, test, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import {
  accessAuth,
  __resetJwksCacheForTests,
} from "../middleware/access-auth";
import type { AppEnv } from "../lib/types";

// vi.hoisted toggle: lets individual tests choose whether jwtVerify
// throws (default — matches the existing 'invalid JWT' contract) or
// returns a verified payload (lets us cover the JWT-success path that
// sets accessAuthenticated + accessEmail).
// Safe because no other test file imports jose (verified via
// `grep -rn 'from "jose"' apps/worker/src packages/api/src`).
const joseControl = vi.hoisted(() => ({
  payload: null as Record<string, unknown> | null, // null → throw
}));
vi.mock("jose", () => ({
  createRemoteJWKSet: () => ({}) as unknown,
  jwtVerify: vi.fn(async () => {
    if (joseControl.payload === null) {
      throw new Error("JWT verification failed");
    }
    return { payload: joseControl.payload };
  }),
}));

function buildApp() {
  const app = new Hono<AppEnv>();
  app.use("*", accessAuth);
  app.all("*", (c) =>
    c.json({ ok: true, email: c.get("accessEmail") ?? null }),
  );
  return app;
}

beforeEach(() => {
  __resetJwksCacheForTests();
  joseControl.payload = null; // default: jwtVerify throws → 401
});

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

  test("verified JWT sets accessEmail from payload (covers JWT-success path)", async () => {
    // Covers lines 92-94 + 100 of access-auth.ts (the JWT-verified
    // success path that sets accessAuthenticated + accessEmail and
    // calls next()). Uses the joseControl toggle to make jwtVerify
    // return a verified payload instead of throwing.
    joseControl.payload = { email: "alice@example.com" };
    const app = buildApp();
    const res = await app.request(
      "/api/projects",
      {
        headers: {
          host: "backy.example.com",
          "Cf-Access-Jwt-Assertion": "any-string", // mocked, not parsed
        },
      },
      {
        CF_ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
        CF_ACCESS_AUD: "test-aud",
      } as unknown as AppEnv["Bindings"],
    );
    expect(res.status).toBe(200);
    // Pins that the email payload made it all the way through
    // accessAuth → next() → downstream handler via c.get('accessEmail').
    expect(await res.json()).toEqual({
      ok: true,
      email: "alice@example.com",
    });
  });

  test("verified JWT without email payload still authenticates (covers typeof-string false branch)", async () => {
    // Covers the false branch of `typeof payload.email === 'string'`
    // — a verified JWT whose payload omits email should still pass
    // through (accessAuthenticated=true) but accessEmail stays unset.
    joseControl.payload = { sub: "some-subject" }; // no email field
    const app = buildApp();
    const res = await app.request(
      "/api/projects",
      {
        headers: {
          host: "backy.example.com",
          "Cf-Access-Jwt-Assertion": "any-string",
        },
      },
      {
        CF_ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
        CF_ACCESS_AUD: "test-aud",
      } as unknown as AppEnv["Bindings"],
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, email: null });
  });

  test("reuses cached JWKS for same team domain (covers getJWKS cache-hit branch)", async () => {
    // Covers line 30 of access-auth.ts: the early-return when jwksCache
    // is populated AND jwksCacheTeamDomain matches. We make 2 sequential
    // calls without resetting the cache; the 2nd hits the early-return.
    joseControl.payload = { email: "alice@example.com" };
    const env = {
      CF_ACCESS_TEAM_DOMAIN: "cache.cloudflareaccess.com",
      CF_ACCESS_AUD: "test-aud",
    } as unknown as AppEnv["Bindings"];
    const headers = {
      host: "backy.example.com",
      "Cf-Access-Jwt-Assertion": "any-string",
    };
    // First call — populates the cache.
    const res1 = await buildApp().request("/api/projects", { headers }, env);
    expect(res1.status).toBe(200);
    // Second call WITHOUT __resetJwksCacheForTests — hits the cache.
    // We bypass the per-test reset by calling the inner request again
    // before the next beforeEach.
    const res2 = await buildApp().request("/api/projects", { headers }, env);
    expect(res2.status).toBe(200);
    expect(await res2.json()).toEqual({
      ok: true,
      email: "alice@example.com",
    });
  });
});
