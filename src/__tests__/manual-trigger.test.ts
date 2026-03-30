import { describe, expect, test, mock, beforeEach, afterEach, spyOn } from "bun:test";
import { NextRequest } from "next/server";
import { mockFetch, d1Success, makeProject, PROJECT_STUBS } from "./helpers";

// --- Mock state ---
let mockProject: Record<string, unknown> | undefined;
let getProjectShouldThrow = false;

mock.module("@/lib/db/projects", () => ({
  ...PROJECT_STUBS,
  getProject: async () => {
    if (getProjectShouldThrow) throw new Error("D1 error");
    return mockProject;
  },
  createProject: async () => ({ id: "mock" }),
}));

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
  return new NextRequest(`http://localhost:7017/api/cron/trigger/${projectId}`, {
    method: "POST",
  });
}

describe("POST /api/cron/trigger/[projectId]", () => {
  let originalFetch: typeof globalThis.fetch;
  let originalSsrfAllowlist: string | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalSsrfAllowlist = process.env.SSRF_ALLOWLIST;
    // Bypass DNS resolution for test webhook URLs
    process.env.SSRF_ALLOWLIST = "https://saas.example.com";
    mockProject = makeProject();
    getProjectShouldThrow = false;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalSsrfAllowlist === undefined) {
      delete process.env.SSRF_ALLOWLIST;
    } else {
      process.env.SSRF_ALLOWLIST = originalSsrfAllowlist;
    }
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
