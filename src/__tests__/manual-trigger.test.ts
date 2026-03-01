import { describe, expect, test, mock, beforeEach, afterEach, spyOn } from "bun:test";
import { NextRequest } from "next/server";

/** Create a mock fetch that satisfies Bun's typeof fetch (includes preconnect). */
function mockFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): typeof globalThis.fetch {
  const fn = handler as typeof globalThis.fetch;
  fn.preconnect = () => {};
  return fn;
}

// --- Mock state ---
let mockProject: Record<string, unknown> | undefined;
let getProjectShouldThrow = false;

mock.module("@/lib/db/projects", () => ({
  getProject: async () => {
    if (getProjectShouldThrow) throw new Error("D1 error");
    return mockProject;
  },
  // Stubs for all exports to avoid breaking other test files
  getProjectByToken: async () => undefined,
  listProjects: async () => [],
  createProject: async () => ({ id: "mock" }),
  updateProject: async () => {},
  deleteProject: async () => {},
  regenerateToken: async () => undefined,
  listAutoBackupProjects: async () => [],
}));

// D1 success response
function d1Success() {
  return new Response(
    JSON.stringify({
      success: true,
      result: [{ results: [], success: true, meta: { changes: 1, last_row_id: 0 } }],
      errors: [],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function makeFetchRouter(
  saasHandler: (url: string, init?: RequestInit) => Promise<Response>,
): typeof globalThis.fetch {
  return mockFetch(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;

    if (url.includes("api.cloudflare.com") && url.includes("/d1/")) {
      return d1Success();
    }

    return saasHandler(url, init);
  });
}

const { POST } = await import("@/app/api/cron/trigger/[projectId]/route");

function makeRequest(projectId: string): NextRequest {
  return new NextRequest(`http://localhost:7026/api/cron/trigger/${projectId}`, {
    method: "POST",
  });
}

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: "proj-test",
    name: "Test Project",
    description: null,
    webhook_token: "tok-abc",
    allowed_ips: null,
    category_id: null,
    auto_backup_enabled: 1,
    auto_backup_interval: 1,
    auto_backup_webhook: "https://saas.example.com/trigger-backup",
    auto_backup_header_key: null,
    auto_backup_header_value: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("POST /api/cron/trigger/[projectId]", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockProject = makeProject();
    getProjectShouldThrow = false;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("returns 404 when project not found", async () => {
    mockProject = undefined;

    const req = makeRequest("nonexistent");
    const params = Promise.resolve({ projectId: "nonexistent" });
    const res = await POST(req, { params });
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data.error).toBe("Project not found");
  });

  test("returns 400 when no webhook URL configured", async () => {
    mockProject = makeProject({ auto_backup_webhook: null });

    const req = makeRequest("proj-test");
    const params = Promise.resolve({ projectId: "proj-test" });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain("No webhook URL");
  });

  test("returns 500 when project fetch fails", async () => {
    getProjectShouldThrow = true;
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

    const req = makeRequest("proj-test");
    const params = Promise.resolve({ projectId: "proj-test" });
    const res = await POST(req, { params });
    expect(res.status).toBe(500);

    consoleSpy.mockRestore();
  });

  test("returns success when webhook responds 200", async () => {
    globalThis.fetch = makeFetchRouter(async () => {
      return new Response("OK", { status: 200 });
    });

    const req = makeRequest("proj-test");
    const params = Promise.resolve({ projectId: "proj-test" });
    const res = await POST(req, { params });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("success");
    expect(data.responseCode).toBe(200);
    expect(typeof data.durationMs).toBe("number");
  });

  test("returns failed when webhook responds with error", async () => {
    globalThis.fetch = makeFetchRouter(async () => {
      return new Response("Internal Server Error", { status: 500 });
    });

    const req = makeRequest("proj-test");
    const params = Promise.resolve({ projectId: "proj-test" });
    const res = await POST(req, { params });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("failed");
    expect(data.responseCode).toBe(500);
  });

  test("returns failed when webhook throws network error", async () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

    globalThis.fetch = makeFetchRouter(async () => {
      throw new Error("Connection refused");
    });

    const req = makeRequest("proj-test");
    const params = Promise.resolve({ projectId: "proj-test" });
    const res = await POST(req, { params });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("failed");
    expect(data.error).toContain("Connection refused");

    consoleSpy.mockRestore();
  });

  test("sends custom auth header when configured", async () => {
    mockProject = makeProject({
      auto_backup_header_key: "X-Custom-Key",
      auto_backup_header_value: "secret-value",
    });
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

    const req = makeRequest("proj-test");
    const params = Promise.resolve({ projectId: "proj-test" });
    await POST(req, { params });

    expect(capturedHeaders["X-Custom-Key"]).toBe("secret-value");
    expect(capturedHeaders["Content-Type"]).toBe("application/json");
  });
});
