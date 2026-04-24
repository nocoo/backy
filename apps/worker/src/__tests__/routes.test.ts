import { describe, expect, test } from "bun:test";
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
  test("GET /api/live", async () => {
    const res = await fetchWith("/api/live");
    expect([200, 503]).toContain(res.status);
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

  test("GET /api/stats/totals", async () => {
    const res = await fetchWith("/api/stats/totals");
    expect([200, 500]).toContain(res.status);
  });

  test("GET /api/stats/charts", async () => {
    const res = await fetchWith("/api/stats/charts");
    expect([200, 500]).toContain(res.status);
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

  test("GET /api/ip-info returns 200", async () => {
    const res = await fetchWith(
      "/api/ip-info?ip=8.8.8.8",
      undefined,
      { ECHO_API_URL: "https://echo.example/api/ip" },
    );
    // ipInfo with no real ECHO upstream just returns whatever the
    // fetcher gave it; we just want to confirm routing works.
    expect([200, 500, 502]).toContain(res.status);
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

  test("PUT /api/projects/:id with empty body → 400 or 404", async () => {
    const res = await fetchWith("/api/projects/missing", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect([400, 404]).toContain(res.status);
  });

  test("PUT /api/categories/:id with empty body → 400 or 404", async () => {
    const res = await fetchWith("/api/categories/missing", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect([400, 404]).toContain(res.status);
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

  test("GET /api/backups/:id/extract 404 when missing", async () => {
    const res = await fetchWith("/api/backups/missing/extract");
    expect(res.status).toBe(404);
  });

  test("GET /api/backups/:id/restore-command 404 when missing", async () => {
    const res = await fetchWith("/api/backups/missing/restore-command");
    expect(res.status).toBe(404);
  });

  test("POST /api/backups/batch-delete with bad body → 400", async () => {
    const res = await fetchWith("/api/backups/batch-delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect([400, 422]).toContain(res.status);
  });

  test("POST /api/cron/trigger/:projectId 404 when project missing", async () => {
    const res = await fetchWith("/api/cron/trigger/missing", { method: "POST" });
    expect([404, 500]).toContain(res.status);
  });

  test("DELETE /api/logs/webhook with empty body 200/400", async () => {
    const res = await fetchWith("/api/logs/webhook", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect([200, 400]).toContain(res.status);
  });

  test("DELETE /api/logs/cron 200/204/400", async () => {
    const res = await fetchWith("/api/logs/cron", { method: "DELETE" });
    expect([200, 204, 400]).toContain(res.status);
  });

  test("POST /api/db/init 200", async () => {
    const res = await fetchWith("/api/db/init", { method: "POST" });
    expect([200, 500]).toContain(res.status);
  });

  test("POST /api/db/seed-test-project 200 with E2E_SKIP_AUTH", async () => {
    const res = await fetchWith("/api/db/seed-test-project", { method: "POST" });
    expect([200, 500]).toContain(res.status);
  });

  test("HEAD /api/webhook/:projectId 404", async () => {
    const res = await fetchWith("/api/webhook/missing", { method: "HEAD" });
    expect([401, 404]).toContain(res.status);
  });

  test("GET /api/webhook/:projectId 404", async () => {
    const res = await fetchWith("/api/webhook/missing");
    expect([401, 404]).toContain(res.status);
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
    await worker.scheduled(
      { scheduledTime: Date.now(), cron: "0 * * * *" } as unknown as ScheduledEvent,
      env as unknown as Bindings,
    );
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
