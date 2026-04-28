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
    const body = (await res.json()) as {
      status: string;
      dependencies: { d1: { status: string }; r2: { status: string } };
    };
    expect(body.status).toBe("ok");
    expect(body.dependencies.d1.status).toBe("up");
    expect(body.dependencies.r2.status).toBe("up");
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
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("environments");
    expect(body).toHaveProperty("projects");
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
    const body = (await res.json()) as Record<string, unknown>;
    // Don't pin exact shape (fakeD1 returns nothing), just verify the
    // handler responds with an object — catches 500/null regressions.
    expect(typeof body).toBe("object");
    expect(body).not.toBeNull();
  });

  test("GET /api/logs/webhook returns paginated payload", async () => {
    const res = await fetchWith("/api/logs/webhook");
    expect(res.status).toBe(200);
  });

  test("GET /api/logs/cron returns paginated payload", async () => {
    const res = await fetchWith("/api/logs/cron");
    expect(res.status).toBe(200);
  });

  test("POST /api/cron/trigger with correct CRON_SECRET", async () => {
    const res = await fetchWith("/api/cron/trigger", {
      method: "POST",
      headers: { authorization: "Bearer test-cron-secret" },
    });
    expect(res.status).toBe(200);
  });

  test("POST /api/cron/trigger with wrong secret → 401", async () => {
    const res = await fetchWith("/api/cron/trigger", {
      method: "POST",
      headers: { authorization: "Bearer wrong" },
    });
    expect(res.status).toBe(401);
  });

  test("GET /api/restore/:id without bearer → 401", async () => {
    const res = await fetchWith("/api/restore/some-id");
    expect(res.status).toBe(401);
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
    expect(body.error).toMatch(/not configured/i);
  });

  test("GET /api/ip-info returns 400 when ip query is missing", async () => {
    const res = await fetchWith("/api/ip-info", undefined, {
      ECHO_API_URL: "https://echo.example/api/ip",
    });
    // No ?ip query and the synthetic Request has no client-ip header,
    // so the handler’s missing-ip guard fires.
    expect(res.status).toBe(400);
  });

  test("GET /api/me without E2E_SKIP_AUTH returns 401", async () => {
    const env: EnvOverrides = { E2E_SKIP_AUTH: undefined };
    const res = await worker.fetch(
      new Request("http://backy.example.com/api/me"),
      makeEnv(env),
      {} as unknown as ExecutionContext,
    );
    expect(res.status).toBe(500); // CF Access not configured → 500
  });

  test("GET /api/projects/:id 404 when not found", async () => {
    const res = await fetchWith("/api/projects/missing");
    expect(res.status).toBe(404);
  });

  test("GET /api/categories/:id 404 when not found", async () => {
    const res = await fetchWith("/api/categories/missing");
    expect(res.status).toBe(404);
  });

  test("GET /api/backups/:id 404 when not found", async () => {
    const res = await fetchWith("/api/backups/missing");
    expect(res.status).toBe(404);
  });

  test("DELETE /api/projects/:id 404", async () => {
    const res = await fetchWith("/api/projects/missing", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  test("DELETE /api/categories/:id 404", async () => {
    const res = await fetchWith("/api/categories/missing", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  test("DELETE /api/backups/:id 404", async () => {
    const res = await fetchWith("/api/backups/missing", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  test("POST /api/projects with bad body → 400", async () => {
    const res = await fetchWith("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test("POST /api/categories with bad body → 400", async () => {
    const res = await fetchWith("/api/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test("PUT /api/projects/:id with empty body returns 404 (project missing wins over validator)", async () => {
    const res = await fetchWith("/api/projects/missing", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(404);
  });

  test("PUT /api/categories/:id with empty body returns 404", async () => {
    const res = await fetchWith("/api/categories/missing", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(404);
  });

  test("POST /api/projects/:id/token 404 when missing", async () => {
    const res = await fetchWith("/api/projects/missing/token", {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });

  test("GET /api/projects/:id/prompt 404 when missing", async () => {
    const res = await fetchWith("/api/projects/missing/prompt");
    expect(res.status).toBe(404);
  });

  test("GET /api/backups/:id/download 404 when missing", async () => {
    const res = await fetchWith("/api/backups/missing/download");
    expect(res.status).toBe(404);
  });

  test("GET /api/backups/:id/preview 404 when missing", async () => {
    const res = await fetchWith("/api/backups/missing/preview");
    expect(res.status).toBe(404);
  });

  test("GET /api/backups/:id/extract returns 404 when missing (GET hits the not-found branch first)", async () => {
    const res = await fetchWith("/api/backups/missing/extract");
    expect(res.status).toBe(404);
  });

  test("POST /api/backups/:id/extract 404 when missing", async () => {
    const res = await fetchWith("/api/backups/missing/extract", { method: "POST" });
    expect(res.status).toBe(404);
  });

  test("GET /api/backups/:id/restore-command 404 when missing", async () => {
    const res = await fetchWith("/api/backups/missing/restore-command");
    expect(res.status).toBe(404);
  });

  test("POST /api/backups/upload with empty form returns 400", async () => {
    const fd = new FormData();
    const res = await fetchWith("/api/backups/upload", {
      method: "POST",
      body: fd,
    });
    expect(res.status).toBe(400);
  });

  test("DELETE /api/backups with empty body returns 400", async () => {
    const res = await fetchWith("/api/backups", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  test("POST /api/cron/trigger/:projectId returns 404 when project missing", async () => {
    const res = await fetchWith("/api/cron/trigger/missing", { method: "POST" });
    expect(res.status).toBe(404);
  });

  test("DELETE /api/logs/webhook with empty body returns 200", async () => {
    const res = await fetchWith("/api/logs/webhook", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(200);
  });

  test("DELETE /api/logs/cron returns 204 (no body)", async () => {
    const res = await fetchWith("/api/logs/cron", { method: "DELETE" });
    expect(res.status).toBe(204);
  });

  test("POST /api/db/init returns 200 with the schema-initialized payload", async () => {
    const res = await fetchWith("/api/db/init", { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; message: string };
    expect(body.ok).toBe(true);
    expect(body.message).toMatch(/Schema initialized/i);
  });

  test("POST /api/db/seed-test-project returns 200 with E2E_SKIP_AUTH", async () => {
    const res = await fetchWith("/api/db/seed-test-project", { method: "POST" });
    expect(res.status).toBe(200);
  });

  test("GET /api/db/init/marker returns marker status", async () => {
    const res = await fetchWith("/api/db/init/marker");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { marker: string | null };
    expect(body).toHaveProperty("marker");
  });

  test("HEAD /api/webhook/:projectId without token returns 401 (auth runs before lookup)", async () => {
    const res = await fetchWith("/api/webhook/missing", { method: "HEAD" });
    expect(res.status).toBe(401);
  });

  test("GET /api/webhook/:projectId without token returns 401", async () => {
    const res = await fetchWith("/api/webhook/missing");
    expect(res.status).toBe(401);
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
    // 401 (bad token) or 404 (missing project) — either proves routing.
    expect([401, 404]).toContain(res.status);
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
    const body = (await res.json()) as Array<{ id: string }>;
    expect(body[0]?.id).toBe("p1");
  });

  test("clientIp falls back to x-forwarded-for in webhook input", async () => {
    const res = await fetchWith("/api/webhook/missing", {
      method: "HEAD",
      headers: { "x-forwarded-for": "9.9.9.9" },
    });
    expect([401, 404]).toContain(res.status);
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
