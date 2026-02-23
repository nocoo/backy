import { describe, expect, test, beforeEach, mock } from "bun:test";
import { NextRequest, NextResponse } from "next/server";

// Track what auth() callback returns based on auth state
let mockIsLoggedIn = false;

// Mock the auth module — auth() wraps a callback with req.auth
mock.module("@/auth", () => ({
  auth: (callback: (req: NextRequest & { auth: unknown }) => Response | NextResponse) => {
    return (request: NextRequest) => {
      const augmented = request as NextRequest & { auth: unknown };
      augmented.auth = mockIsLoggedIn ? { user: { email: "test@example.com" } } : null;
      return callback(augmented);
    };
  },
}));

const { proxy, config } = await import("@/proxy");

function createRequest(pathname: string, headers?: Record<string, string>): NextRequest {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const init: any = {};
  if (headers) {
    init.headers = new Headers(headers);
  }
  return new NextRequest(new URL(pathname, "http://localhost:7026"), init);
}

async function callProxy(req: NextRequest): Promise<Response> {
  return (await proxy(req)) as Response;
}

describe("proxy auth rules", () => {
  beforeEach(() => {
    mockIsLoggedIn = false;
  });

  test("config.matcher is defined and non-empty", () => {
    expect(config.matcher).toBeDefined();
    expect(config.matcher.length).toBeGreaterThan(0);
  });

  // Public routes — should pass through regardless of auth
  describe("public routes", () => {
    test("allows /api/auth routes without auth", async () => {
      const res = await callProxy(createRequest("/api/auth/signin"));
      expect(res.status).not.toBe(307);
    });

    test("allows /api/live health check without auth", async () => {
      const res = await callProxy(createRequest("/api/live"));
      expect(res.status).not.toBe(307);
    });

    test("allows /api/webhook routes without auth", async () => {
      const res = await callProxy(createRequest("/api/webhook/proj-123"));
      expect(res.status).not.toBe(307);
    });

    test("allows /api/restore routes without auth", async () => {
      const res = await callProxy(createRequest("/api/restore/backup-123"));
      expect(res.status).not.toBe(307);
    });
  });

  // Protected routes — should redirect to /login when not authenticated
  describe("protected routes (unauthenticated)", () => {
    test("redirects / to /login when not logged in", async () => {
      const res = await callProxy(createRequest("/"));
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
    });

    test("redirects /projects to /login when not logged in", async () => {
      const res = await callProxy(createRequest("/projects"));
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
    });

    test("redirects /api/backups to /login when not logged in", async () => {
      const res = await callProxy(createRequest("/api/backups"));
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
    });
  });

  // Authenticated access
  describe("authenticated routes", () => {
    beforeEach(() => {
      mockIsLoggedIn = true;
    });

    test("allows / when logged in", async () => {
      const res = await callProxy(createRequest("/"));
      expect(res.status).not.toBe(307);
    });

    test("allows /projects when logged in", async () => {
      const res = await callProxy(createRequest("/projects"));
      expect(res.status).not.toBe(307);
    });

    test("redirects /login to / when already logged in", async () => {
      const res = await callProxy(createRequest("/login"));
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get("location")!).pathname).toBe("/");
    });
  });

  // Login page when unauthenticated — should show login page
  describe("login page", () => {
    test("allows /login when not logged in", async () => {
      const res = await callProxy(createRequest("/login"));
      expect(res.status).not.toBe(307);
    });
  });

  // Reverse proxy header handling
  describe("buildRedirectUrl with forwarded headers", () => {
    test("uses x-forwarded-host for redirects", async () => {
      const res = await callProxy(
        createRequest("/projects", {
          "x-forwarded-host": "backy.dev.hexly.ai",
          "x-forwarded-proto": "https",
        }),
      );
      expect(res.status).toBe(307);
      const location = res.headers.get("location")!;
      expect(location).toContain("backy.dev.hexly.ai");
      expect(location).toStartWith("https://");
    });

    test("defaults to https for x-forwarded-proto", async () => {
      const res = await callProxy(
        createRequest("/projects", {
          "x-forwarded-host": "backy.dev.hexly.ai",
        }),
      );
      expect(res.status).toBe(307);
      expect(res.headers.get("location")!).toStartWith("https://");
    });
  });
});
