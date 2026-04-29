import { describe, expect, test } from "vitest";
import worker from "../index";
import { fakeD1, fakeR2, makeEnv, type EnvOverrides } from "./helpers";
import type { Bindings } from "../lib/types";
import type { D1Binding } from "@backy/api/db/d1-binding-adapter";

function fetchWith(
  url: string,
  init?: RequestInit,
  env?: EnvOverrides,
) {
  const merged = makeEnv(env);
  return worker.fetch(
    new Request(`http://localhost${url}`, init),
    merged,
    { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext,
  );
}

describe("worker routes — happy paths via E2E_SKIP_AUTH", () => {
  test("GET /api/live returns 200 with both dependencies up", async () => {
    const res = await fetchWith("/api/live");
    // fakeD1.query and fakeR2.ping both succeed, so both dependencies
    // report `up` and the handler picks the 200 branch deterministically.
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    // Tightened: from 3 single-property checks to a full toMatchObject
    // pinning the live-check envelope shape. Catches snake→camel drift
    // (latency_ms vs latencyMs), dropped fields (uptime_s/version/
    // timestamp), and missing 'message: undefined' on the up branch
    // (sanitizeMessage shouldn't fire when status='up').
    expect(body).toMatchObject({
      status: "ok",
      uptime_s: expect.any(Number),
      version: expect.any(String),
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      dependencies: {
        d1: { status: "up", latency_ms: expect.any(Number) },
        r2: { status: "up", latency_ms: expect.any(Number) },
      },
    });
  });

  test("GET /api/me with E2E_SKIP_AUTH returns dev email", async () => {
    const res = await fetchWith("/api/me");
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual({
      authenticated: true,
      email: "dev@local",
    });
  });

  test("GET /api/projects returns []", async () => {
    const res = await fetchWith("/api/projects");
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual([]);
  });

  test("GET /api/categories returns []", async () => {
    const res = await fetchWith("/api/categories");
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual([]);
  });

  test("GET /api/backups returns paginated payload", async () => {
    const res = await fetchWith("/api/backups");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
      environments: [],
      projects: [],
    });
  });

  test("GET /api/backups with query params (projectId/search/environment)", async () => {
    // Covers the conditional spread branches in apps/worker/src/routes/backups.ts
    // (lines 24-26): when projectId/search/environment are defined,
    // they spread into the handler input. Without query-param tests,
    // these branches were uncovered.
    const res = await fetchWith(
      "/api/backups?projectId=p1&search=foo&environment=prod",
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
      environments: [],
      projects: [],
    });
  });

  test("GET /api/stats/totals returns zeroed totals on empty DB", async () => {
    const res = await fetchWith("/api/stats/totals");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      totalProjects: number;
      totalBackups: number;
      totalStorageBytes: number;
    };
    // fakeD1 returns no rows; the handler's empty-fallback should produce
    // a fully-shaped {0, 0, 0} payload (catches accidental shape drift).
    expect(body).toEqual({
      totalProjects: 0,
      totalBackups: 0,
      totalStorageBytes: 0,
    });
  });

  test("GET /api/stats/charts returns the expected sub-fields", async () => {
    const res = await fetchWith("/api/stats/charts");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      projectStats: [],
      dailyBackups: [],
      cronStats: [],
    });
  });

  test("GET /api/logs/webhook returns paginated payload", async () => {
    const res = await fetchWith("/api/logs/webhook");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
      totalPages: 0,
    });
  });

  test("GET /api/logs/cron returns paginated payload", async () => {
    const res = await fetchWith("/api/logs/cron");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
      totalPages: 0,
    });
  });

  test("POST /api/cron/trigger with correct CRON_SECRET", async () => {
    const res = await fetchWith("/api/cron/trigger", {
      method: "POST",
      headers: { authorization: "Bearer test-cron-secret" },
    });
    expect(res.status).toBe(200);
    // fakeD1 returns no auto-backup projects, so the cron summary
    // returns all-zeros AND no `results` field (omitted when empty).
    // Pin the full envelope so a regression that drops a counter or
    // adds a results-array would surface.
    expect(await res.json()).toEqual({
      total: 0,
      triggered: 0,
      skipped: 0,
      failed: 0,
    });
  });

  test("POST /api/cron/trigger with wrong secret → 401", async () => {
    const res = await fetchWith("/api/cron/trigger", {
      method: "POST",
      headers: { authorization: "Bearer wrong" },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  test("GET /api/restore/:id without bearer → 401", async () => {
    const res = await fetchWith("/api/restore/some-id");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error:
        "Missing authentication. Provide Authorization: Bearer header or ?token= query param.",
    });
  });

  test("GET /api/ip-info returns 503 when ECHO_API_URL is unset", async () => {
    // Deterministic: with no echo upstream configured the handler short-
    // circuits to 503. Previously this test set ECHO_API_URL to an
    // unreachable .example host and asserted `[200, 500, 502]` — which
    // smuggled a real DNS lookup into the suite (~14ms + flake risk when
    // the network resolver is slow or offline).
    const res = await fetchWith("/api/ip-info?ip=8.8.8.8", undefined, {
      ECHO_API_URL: undefined,
    });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body).toEqual({ error: "IP info service not configured" });
  });

  test("GET /api/ip-info returns 400 when ip query is missing", async () => {
    const res = await fetchWith("/api/ip-info", undefined, {
      ECHO_API_URL: "https://echo.example/api/ip",
    });
    // No ?ip query and the synthetic Request has no client-ip header,
    // so the handler’s missing-ip guard fires.
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing ip parameter" });
  });

  test("GET /api/me without E2E_SKIP_AUTH returns 401", async () => {
    const env: EnvOverrides = { E2E_SKIP_AUTH: undefined };
    const res = await worker.fetch(
      new Request("http://backy.example.com/api/me"),
      makeEnv(env),
      {} as unknown as ExecutionContext,
    );
    expect(res.status).toBe(500); // CF Access not configured → 500
    expect(await res.json()).toEqual({
      error: "Cloudflare Access not configured",
    });
  });

  test("GET /api/projects/:id 404 when not found", async () => {
    const res = await fetchWith("/api/projects/missing");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Project not found" });
  });

  test("GET /api/categories/:id 404 when not found", async () => {
    const res = await fetchWith("/api/categories/missing");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Category not found" });
  });

  test("GET /api/backups/:id 404 when not found", async () => {
    const res = await fetchWith("/api/backups/missing");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Backup not found" });
  });

  test("DELETE /api/projects/:id 404", async () => {
    const res = await fetchWith("/api/projects/missing", { method: "DELETE" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Project not found" });
  });

  test("DELETE /api/categories/:id 404", async () => {
    const res = await fetchWith("/api/categories/missing", { method: "DELETE" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Category not found" });
  });

  test("DELETE /api/backups/:id 404", async () => {
    const res = await fetchWith("/api/backups/missing", { method: "DELETE" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Backup not found" });
  });

  test("POST /api/projects with bad body → 400", async () => {
    const res = await fetchWith("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: "Invalid input",
      details: { fieldErrors: { name: expect.arrayContaining([expect.any(String)]) } },
    });
  });

  test("POST /api/categories with bad body → 400", async () => {
    const res = await fetchWith("/api/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: "Invalid input",
      details: { fieldErrors: { name: expect.arrayContaining([expect.any(String)]) } },
    });
  });

  test("PUT /api/projects/:id with empty body returns 404 (project missing wins over validator)", async () => {
    const res = await fetchWith("/api/projects/missing", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Project not found" });
  });

  test("PUT /api/categories/:id with empty body returns 404", async () => {
    const res = await fetchWith("/api/categories/missing", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Category not found" });
  });

  test("POST /api/projects/:id/token 404 when missing", async () => {
    const res = await fetchWith("/api/projects/missing/token", {
      method: "POST",
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Project not found" });
  });

  test("GET /api/projects/:id/prompt 404 when missing", async () => {
    const res = await fetchWith("/api/projects/missing/prompt");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Project not found" });
  });

  test("GET /api/backups/:id/download 404 when missing", async () => {
    const res = await fetchWith("/api/backups/missing/download");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Backup not found" });
  });

  test("GET /api/backups/:id/preview 404 when missing", async () => {
    const res = await fetchWith("/api/backups/missing/preview");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Backup not found" });
  });

  test("GET /api/backups/:id/extract returns 404 when missing (GET hits the not-found branch first)", async () => {
    const res = await fetchWith("/api/backups/missing/extract");
    expect(res.status).toBe(404);
    // GET /api/backups/:id/extract has no route handler (only POST is
    // wired). Hono's default 404 returns plain text "404 Not Found",
    // NOT a JSON body — this documents the missing-route contract
    // (vs the POST below that returns JSON {error:'Backup not found'}).
    expect(await res.text()).toBe("404 Not Found");
  });

  test("POST /api/backups/:id/extract 404 when missing", async () => {
    const res = await fetchWith("/api/backups/missing/extract", { method: "POST" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Backup not found" });
  });

  test("GET /api/backups/:id/restore-command 404 when missing", async () => {
    const res = await fetchWith("/api/backups/missing/restore-command");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Backup not found" });
  });

  test("POST /api/backups/upload with empty form returns 400", async () => {
    const fd = new FormData();
    const res = await fetchWith("/api/backups/upload", {
      method: "POST",
      body: fd,
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "projectId is required" });
  });

  test("DELETE /api/backups with empty body returns 400", async () => {
    const res = await fetchWith("/api/backups", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "ids must be a non-empty array of strings",
    });
  });

  test("POST /api/cron/trigger/:projectId returns 404 when project missing", async () => {
    const res = await fetchWith("/api/cron/trigger/missing", { method: "POST" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Project not found" });
  });

  test("DELETE /api/logs/webhook with empty body returns 200", async () => {
    const res = await fetchWith("/api/logs/webhook", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  test("DELETE /api/logs/cron returns 204 (no body)", async () => {
    const res = await fetchWith("/api/logs/cron", { method: "DELETE" });
    expect(res.status).toBe(204);
    // 204 No Content must NOT have a body.
    expect(await res.text()).toBe("");
  });

  test("POST /api/db/init returns 200 with the schema-initialized payload", async () => {
    const res = await fetchWith("/api/db/init", { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; message: string };
    // Tightened: pin full schema-init envelope (no extras, exact copy).
    expect(body).toEqual({ ok: true, message: "Schema initialized" });
  });

  test("POST /api/db/seed-test-project returns 200 with E2E_SKIP_AUTH", async () => {
    const res = await fetchWith("/api/db/seed-test-project", { method: "POST" });
    expect(res.status).toBe(200);
    // fakeD1 returns empty results for the existence-check query, so
    // the handler hits the 'created' branch with TEST_PROJECT id+token.
    expect(await res.json()).toEqual({
      action: "created",
      projectId: "mnp039joh6yiala5UY0Hh",
      webhookToken: "wDzglaK3i-tTUmHsTsCdTWQVTeZWSn9tGfCaW4lR1f3JPGzJ",
      cleanedBackups: 0,
    });
  });

  test("GET /api/db/init/marker returns marker status", async () => {
    const res = await fetchWith("/api/db/init/marker");
    expect(res.status).toBe(200);
    // fakeD1 returns no rows for the marker query, so the handler must
    // resolve to {marker:null}. Pin the exact shape (was toHaveProperty).
    expect(await res.json()).toEqual({ marker: null });
  });

  test("HEAD /api/webhook/:projectId without token returns 401 (auth runs before lookup)", async () => {
    const res = await fetchWith("/api/webhook/missing", { method: "HEAD" });
    expect(res.status).toBe(401);
    // HEAD never has a body — the empty(401) handler enforces this.
    expect(await res.text()).toBe("");
  });

  test("GET /api/webhook/:projectId without token returns 401", async () => {
    const res = await fetchWith("/api/webhook/missing");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: "Missing or invalid Authorization header",
    });
  });
});

describe("worker routes — webhook POST hits the streaming path", () => {
  test("POST /api/webhook/:projectId with form data", async () => {
    const fd = new FormData();
    fd.append("file", new Blob(["x"], { type: "text/plain" }), "x.txt");
    const res = await fetchWith("/api/webhook/missing", {
      method: "POST",
      body: fd,
    });
    // No bearer/token → webhook auth runs before project lookup, so 401
    // wins deterministically. Previous OR-of-[401,404] hid any regression
    // that flipped the auth-vs-lookup precedence.
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: "Missing or invalid Authorization header",
    });
  });
});

describe("worker routes — input shaping", () => {
  test("rows from D1 propagate via list endpoints", async () => {
    const project = {
      id: "p1",
      name: "test",
      token: "t",
      enabled: 1,
      created_at: new Date().toISOString(),
      auto_backup_header_key: null,
      auto_backup_header_value: null,
    };
    const env = makeEnv({
      DB: fakeD1([project]) as unknown as D1Database,
    });
    const res = await worker.fetch(
      new Request("http://localhost/api/projects"),
      env,
      {} as unknown as ExecutionContext,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Record<string, unknown>>;
    // Tightened: pin entire array shape (was indexed-property check).
    // The list goes through sanitizeProject() which drops webhook_token
    // + auto_backup_header_{key,value} and adds auto_backup_headers_configured.
    expect(body).toEqual([
      expect.objectContaining({
        id: "p1",
        name: "test",
        auto_backup_headers_configured: false,
      }),
    ]);
    // Also positively verify sanitization: webhook_token MUST NOT be
    // present (was implicit; now explicit).
    expect(body[0]).not.toHaveProperty("webhook_token");
  });

  test("clientIp falls back to x-forwarded-for in webhook input", async () => {
    const res = await fetchWith("/api/webhook/missing", {
      method: "HEAD",
      headers: { "x-forwarded-for": "9.9.9.9" },
    });
    // Same auth-precedence as above: missing token → 401 deterministic.
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("");
  });

  test("ctx env passes ALLOWED_HOSTS through to baseUrl logic", async () => {
    const env = makeEnv({ ALLOWED_HOSTS: "trusted.example" });
    const res = await worker.fetch(
      new Request("http://localhost/api/projects/missing/prompt", {
        headers: { "x-forwarded-host": "trusted.example" },
      }),
      env,
      {} as unknown as ExecutionContext,
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Project not found" });
  });
});

describe("worker scheduled()", () => {
  test("succeeds with valid CRON_SECRET", async () => {
    const env = makeEnv();
    await expect(
      worker.scheduled(
        { scheduledTime: Date.now(), cron: "0 * * * *" } as unknown as ScheduledEvent,
        env as unknown as Bindings,
      ),
    ).resolves.toBeUndefined();
  });

  test("throws when CRON_SECRET missing", async () => {
    const env = makeEnv({ CRON_SECRET: undefined });
    await expect(
      worker.scheduled(
        { scheduledTime: Date.now(), cron: "0 * * * *" } as unknown as ScheduledEvent,
        env as unknown as Bindings,
      ),
    ).rejects.toThrow(/CRON_SECRET not configured/);
  });
});

describe("worker bindings — fakeD1 query shape", () => {
  test("D1Binding fake exposes prepare/bind/all", async () => {
    const db = fakeD1([{ id: "x" }]) as D1Binding;
    const out = await db.prepare("SELECT 1").bind().all<{ id: string }>();
    expect(out.results).toEqual([{ id: "x" }]);
  });

  test("R2Binding fake stores and retrieves", async () => {
    const r2 = fakeR2();
    await r2.put("k", new ArrayBuffer(2));
    const head = await r2.head("k");
    expect(head?.size).toBe(2);
    await r2.delete("k");
    expect(await r2.head("k")).toBeNull();
  });
});
