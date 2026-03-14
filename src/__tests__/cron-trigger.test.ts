import { describe, expect, test, mock, beforeEach, afterEach, spyOn } from "bun:test";
import { NextRequest } from "next/server";
import { mockFetch, d1Success, makeProject, PROJECT_STUBS } from "./helpers";

// --- Track calls to mocked dependencies ---
let mockProjects: Record<string, unknown>[] = [];
let capturedCronLogs: Record<string, unknown>[] = [];
let listAutoBackupProjectsShouldThrow = false;

// Mock only @/lib/db/projects (global mock; must include stubs for ALL exports
// so other test files that mock.module the same module don't break).
mock.module("@/lib/db/projects", () => ({
  ...PROJECT_STUBS,
  listAutoBackupProjects: async () => {
    if (listAutoBackupProjectsShouldThrow) throw new Error("D1 timeout");
    return mockProjects;
  },
  createProject: async () => ({ id: "mock" }),
}));

// NOTE: Do NOT mock @/lib/db/cron-logs here — that breaks cron-logs.test.ts
// because Bun's mock.module is global. Instead, we intercept D1 HTTP calls
// via globalThis.fetch and capture the SQL payloads for cron_logs inserts.

const { POST } = await import("@/app/api/cron/trigger/route");

function makeRequest(token?: string): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return new NextRequest("http://localhost:7026/api/cron/trigger", {
    method: "POST",
    headers,
  });
}

/**
 * Create a fetch handler that routes:
 *   - D1 API calls (cloudflare.com) → capture SQL body, return d1Success
 *   - SaaS webhook calls → delegate to `saasHandler`
 */
function makeFetchRouter(
  saasHandler: (url: string, init?: RequestInit) => Promise<Response>,
): typeof globalThis.fetch {
  return mockFetch(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;

    // D1 API call — capture the body for assertions and return success
    if (url.includes("api.cloudflare.com") && url.includes("/d1/")) {
      const bodyStr = init?.body as string;
      if (bodyStr) {
        try {
          const body = JSON.parse(bodyStr);
          if (body.sql && body.sql.includes("cron_logs")) {
            capturedCronLogs.push(body);
          }
        } catch {
          // ignore non-JSON bodies
        }
      }
      return d1Success();
    }

    // SaaS webhook call
    return saasHandler(url, init);
  });
}

describe("POST /api/cron/trigger", () => {
  let originalFetch: typeof globalThis.fetch;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalEnv = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "test-cron-secret";
    mockProjects = [];
    capturedCronLogs = [];
    listAutoBackupProjectsShouldThrow = false;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalEnv;
    }
  });

  test("returns 500 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const req = makeRequest("some-token");
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("CRON_SECRET not configured");
  });

  test("returns 401 when no auth header", async () => {
    const req = makeRequest();
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  test("returns 401 when token is wrong", async () => {
    const req = makeRequest("wrong-token");
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  test("returns 200 with empty summary when no projects", async () => {
    mockProjects = [];

    // Still need to mock fetch for D1 calls (even if no projects, the route may not call D1)
    globalThis.fetch = makeFetchRouter(async () => {
      return new Response("Not expected", { status: 500 });
    });

    const req = makeRequest("test-cron-secret");
    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toEqual({ total: 0, triggered: 0, skipped: 0, failed: 0 });
  });

  test("triggers a project with interval=1 (always triggers)", async () => {
    const project = makeProject({ auto_backup_interval: 1 });
    mockProjects = [project];
    let saasCallUrl = "";

    globalThis.fetch = makeFetchRouter(async (url) => {
      saasCallUrl = url;
      return new Response("OK", { status: 200 });
    });

    const req = makeRequest("test-cron-secret");
    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.total).toBe(1);
    expect(data.triggered).toBe(1);
    expect(data.skipped).toBe(0);
    expect(data.failed).toBe(0);
    expect(saasCallUrl).toBe("https://saas.example.com/trigger-backup");
  });

  test("skips a project when interval does not match current hour", async () => {
    const project = makeProject({ auto_backup_interval: 24 });
    mockProjects = [project];
    let saasCallCount = 0;

    globalThis.fetch = makeFetchRouter(async () => {
      saasCallCount++;
      return new Response("OK", { status: 200 });
    });

    const req = makeRequest("test-cron-secret");
    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.total).toBe(1);
    // interval=24 triggers only at UTC hour 0
    const currentHour = new Date().getUTCHours();
    if (currentHour === 0) {
      expect(data.triggered).toBe(1);
      expect(data.skipped).toBe(0);
      expect(saasCallCount).toBe(1);
    } else {
      expect(data.skipped).toBe(1);
      expect(data.triggered).toBe(0);
      expect(saasCallCount).toBe(0);
    }
  });

  test("logs failed when SaaS webhook returns error", async () => {
    const project = makeProject({ auto_backup_interval: 1 });
    mockProjects = [project];

    globalThis.fetch = makeFetchRouter(async () => {
      return new Response("Service Unavailable", { status: 503 });
    });

    const req = makeRequest("test-cron-secret");
    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.total).toBe(1);
    expect(data.failed).toBe(1);
    expect(data.triggered).toBe(0);

    // Verify cron log was captured with failed status
    const failedLog = capturedCronLogs.find(
      (l) => l.sql && (l.sql as string).includes("INSERT INTO cron_logs") && l.params && (l.params as unknown[]).includes("failed"),
    );
    expect(failedLog).toBeDefined();
  });

  test("logs failed when SaaS webhook throws network error", async () => {
    const project = makeProject({ auto_backup_interval: 1 });
    mockProjects = [project];

    globalThis.fetch = makeFetchRouter(async () => {
      throw new Error("Connection refused");
    });

    const req = makeRequest("test-cron-secret");
    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.total).toBe(1);
    expect(data.failed).toBe(1);

    const failedLog = capturedCronLogs.find(
      (l) => l.sql && (l.sql as string).includes("INSERT INTO cron_logs") && l.params && (l.params as unknown[]).includes("failed"),
    );
    expect(failedLog).toBeDefined();
  });

  test("sends custom auth header when configured", async () => {
    const project = makeProject({
      auto_backup_interval: 1,
      auto_backup_header_key: "X-Api-Key",
      auto_backup_header_value: "my-secret-key",
    });
    mockProjects = [project];
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = makeFetchRouter(async (_url, init) => {
      capturedHeaders = {};
      if (init?.headers) {
        const h = init.headers as Record<string, string>;
        for (const [k, v] of Object.entries(h)) {
          capturedHeaders[k] = v;
        }
      }
      return new Response("OK", { status: 200 });
    });

    const req = makeRequest("test-cron-secret");
    await POST(req);

    expect(capturedHeaders["X-Api-Key"]).toBe("my-secret-key");
    expect(capturedHeaders["Content-Type"]).toBe("application/json");
  });

  test("handles multiple projects with mixed results", async () => {
    mockProjects = [
      makeProject({ id: "proj-1", auto_backup_interval: 1, auto_backup_webhook: "https://saas1.example.com/backup" }),
      makeProject({ id: "proj-2", auto_backup_interval: 1, auto_backup_webhook: "https://saas2.example.com/backup" }),
      makeProject({ id: "proj-3", auto_backup_interval: 1, auto_backup_webhook: "https://saas3.example.com/backup" }),
    ];
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

    globalThis.fetch = makeFetchRouter(async (url) => {
      if (url.includes("saas1")) return new Response("OK", { status: 200 });
      if (url.includes("saas2")) return new Response("Error", { status: 500 });
      throw new Error("DNS resolution failed");
    });

    const req = makeRequest("test-cron-secret");
    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.total).toBe(3);
    expect(data.triggered).toBe(1);
    expect(data.failed).toBe(2);
    expect(data.skipped).toBe(0);

    consoleSpy.mockRestore();
  });

  test("returns 500 when project query fails", async () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    listAutoBackupProjectsShouldThrow = true;

    const req = makeRequest("test-cron-secret");
    const res = await POST(req);
    expect(res.status).toBe(500);

    const data = await res.json();
    expect(data.error).toContain("Failed to query projects");

    consoleSpy.mockRestore();
  });

  test("SSRF: marks project as failed when webhook URL targets private address", async () => {
    const project = makeProject({
      auto_backup_interval: 1,
      auto_backup_webhook: "http://localhost:3000/internal",
    });
    mockProjects = [project];
    let saasCallCount = 0;

    globalThis.fetch = makeFetchRouter(async () => {
      saasCallCount++;
      return new Response("OK", { status: 200 });
    });

    const req = makeRequest("test-cron-secret");
    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.total).toBe(1);
    expect(data.failed).toBe(1);
    expect(data.triggered).toBe(0);
    expect(saasCallCount).toBe(0); // should never reach the SaaS webhook

    // Verify SSRF error was logged
    const ssrfLog = capturedCronLogs.find(
      (l) => l.params && (l.params as unknown[]).some((p) => typeof p === "string" && p.includes("SSRF")),
    );
    expect(ssrfLog).toBeDefined();
  });
});
