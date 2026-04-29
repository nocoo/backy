import {
  describe,
  expect,
  test,
  beforeEach,
  afterAll,
  vi,
} from "vitest";
import {
  PROJECT_STUBS,
  CRON_LOG_STUBS,
  makeMockCtx,
  mockFetch,
} from "../helpers";

// Capture real implementations BEFORE mock.module replaces them, otherwise
// re-reading via `realIsUrlSafe` would dispatch back through the mock
// wrapper and infinite-loop.
const realIsUrlSafe = (await import("../../lib/url")).isUrlSafe;
const realResolveAndValidateUrl = (await import("../../lib/url"))
  .resolveAndValidateUrl;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockListAutoBackupProjects: () => Promise<any[]> = async () => [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockGetProject: (id: string) => Promise<any> = async () => undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockCreateCronLog: (...a: any[]) => Promise<void> = async () => {};

// Default to real implementations so other test files (e.g. projects.test.ts)
// that exercise the real url helpers continue to pass under mock.module's
// global pollution. Tests here override per-case in beforeEach.
let mockIsUrlSafe: (
  url: string,
  env: { SSRF_ALLOWLIST?: string },
) => boolean = realIsUrlSafe;
let mockResolveAndValidateUrl: (
  url: string,
  env: { SSRF_ALLOWLIST?: string },
) => Promise<{ safe: boolean; reason?: string }> = realResolveAndValidateUrl;

function skipDb<T extends unknown[], R>(fn: (...args: T) => R) {
  return (...args: [unknown, ...T]) => fn(...(args.slice(1) as T));
}

vi.doMock("../../lib/url", () => ({
  isUrlSafe: (url: string, env: { SSRF_ALLOWLIST?: string }) =>
    mockIsUrlSafe(url, env),
  resolveAndValidateUrl: (
    url: string,
    env: { SSRF_ALLOWLIST?: string },
  ) => mockResolveAndValidateUrl(url, env),
}));

vi.doMock("../../lib/db/projects", () => ({
  ...PROJECT_STUBS,
  listAutoBackupProjects: skipDb(() => mockListAutoBackupProjects()),
  getProject: skipDb((id: string) => mockGetProject(id)),
}));

vi.doMock("../../lib/db/cron-logs", () => ({
  ...CRON_LOG_STUBS,
  createCronLog: skipDb((...a: unknown[]) => mockCreateCronLog(...a)),
}));

const cronHandlers = await import("../../handlers/cron");

const realFetch = globalThis.fetch;
const ctx = makeMockCtx({ env: { CRON_SECRET: "test-secret" } });
const cronTriggerHandler = (
  input: Parameters<typeof cronHandlers.cronTriggerHandler>[0],
) => cronHandlers.cronTriggerHandler(input, ctx);
const cronTriggerOneHandler = (
  input: Parameters<typeof cronHandlers.cronTriggerOneHandler>[0],
) => cronHandlers.cronTriggerOneHandler(input, ctx);

afterAll(() => {
  globalThis.fetch = realFetch;
  // Reset mock.module overrides back to real implementations so other test
  // files (e.g. projects.test.ts) that exercise unsafe URLs get correct
  // behavior — mock.module is global and persists across files.
  mockIsUrlSafe = realIsUrlSafe;
  mockResolveAndValidateUrl = realResolveAndValidateUrl;
});

describe("cron handlers", () => {
  beforeEach(() => {
    mockListAutoBackupProjects = async () => [];
    mockGetProject = async () => undefined;
    mockCreateCronLog = async () => {};
    mockIsUrlSafe = realIsUrlSafe;
    mockResolveAndValidateUrl = realResolveAndValidateUrl;
    globalThis.fetch = realFetch;
    ctx.env.CRON_SECRET = "test-secret";
  });

  describe("cronTriggerHandler", () => {
    test("500 when CRON_SECRET missing", async () => {
      delete ctx.env.CRON_SECRET;
      const r = await cronTriggerHandler({
        authorization: "Bearer test-secret",
      });
      expect(r.status).toBe(500);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        expect(r.body).toEqual({ error: "CRON_SECRET not configured" });
    });

    test("401 when no auth", async () => {
      const r = await cronTriggerHandler({ authorization: null });
      expect(r.status).toBe(401);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        expect(r.body).toEqual({ error: "Unauthorized" });
    });

    test("401 when wrong token", async () => {
      const r = await cronTriggerHandler({
        authorization: "Bearer wrong",
      });
      expect(r.status).toBe(401);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        // Same generic 'Unauthorized' for both no-auth and wrong-token
        // (don't leak which one caused the 401).
        expect(r.body).toEqual({ error: "Unauthorized" });
    });

    test("500 when listAutoBackupProjects throws", async () => {
      mockListAutoBackupProjects = async () => {
        throw new Error("db");
      };
      const r = await cronTriggerHandler({
        authorization: "Bearer test-secret",
      });
      expect(r.status).toBe(500);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        expect(r.body).toEqual({ error: "Failed to query projects" });
    });

    test("200 with empty projects", async () => {
      const r = await cronTriggerHandler({
        authorization: "Bearer test-secret",
      });
      expect(r.status).toBe(200);
      expect(r.kind).toBe("json");
      if (r.kind === "json") {
        // Pinned via toEqual: catches a regression that adds a
        // `results: []` field when empty (the handler intentionally
        // OMITS results when 0 projects — documented contract). Routes
        // integration test in apps/worker/routes.test pins the same.
        expect(r.body).toEqual({
          total: 0,
          triggered: 0,
          skipped: 0,
          failed: 0,
        });
        // Defense-in-depth: assert key is missing (toEqual already
        // catches this but explicit doc helps future readers).
        expect((r.body as Record<string, unknown>)).not.toHaveProperty(
          "results",
        );
      }
    });

    test("skips project without webhook URL", async () => {
      mockListAutoBackupProjects = async () => [
        { id: "p1", auto_backup_webhook: "", auto_backup_interval: 1 },
      ];
      const r = await cronTriggerHandler({
        authorization: "Bearer test-secret",
      });
      expect(r.status).toBe(200);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        expect(r.body).toEqual({
          total: 1,
          triggered: 0,
          skipped: 1,
          failed: 0,
        });
    });

    test("skips project not due this hour", async () => {
      mockIsUrlSafe = () => true;
      mockResolveAndValidateUrl = async () => ({ safe: true });
      mockListAutoBackupProjects = async () => [
        {
          id: "p1",
          auto_backup_webhook: "https://hook.example.com",
          auto_backup_interval: 999,
          auto_backup_header_key: null,
          auto_backup_header_value: null,
        },
      ];
      const r = await cronTriggerHandler({
        authorization: "Bearer test-secret",
      });
      expect(r.status).toBe(200);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        expect(r.body).toEqual({
          total: 1,
          triggered: 0,
          skipped: 1,
          failed: 0,
        });
    });

    test("fails project when SSRF static check blocks", async () => {
      mockIsUrlSafe = () => false;
      mockListAutoBackupProjects = async () => [
        {
          id: "p1",
          auto_backup_webhook: "http://10.0.0.1/hook",
          auto_backup_interval: 1,
          auto_backup_header_key: null,
          auto_backup_header_value: null,
        },
      ];
      const r = await cronTriggerHandler({
        authorization: "Bearer test-secret",
      });
      expect(r.status).toBe(200);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        expect(r.body).toEqual({
          total: 1,
          triggered: 0,
          skipped: 0,
          failed: 1,
        });
    });

    test("fails project when DNS check fails", async () => {
      mockIsUrlSafe = () => true;
      mockResolveAndValidateUrl = async () => ({
        safe: false,
        reason: "private",
      });
      mockListAutoBackupProjects = async () => [
        {
          id: "p1",
          auto_backup_webhook: "https://hook.example.com",
          auto_backup_interval: 1,
          auto_backup_header_key: null,
          auto_backup_header_value: null,
        },
      ];
      const r = await cronTriggerHandler({
        authorization: "Bearer test-secret",
      });
      expect(r.status).toBe(200);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        expect(r.body).toEqual({
          total: 1,
          triggered: 0,
          skipped: 0,
          failed: 1,
        });
    });

    test("triggers successfully when fetch ok", async () => {
      mockIsUrlSafe = () => true;
      mockResolveAndValidateUrl = async () => ({ safe: true });
      mockListAutoBackupProjects = async () => [
        {
          id: "p1",
          auto_backup_webhook: "https://hook.example.com",
          auto_backup_interval: 1,
          auto_backup_header_key: "X-Key",
          auto_backup_header_value: "secret",
        },
      ];
      let capturedHeaders: Headers | undefined;
      globalThis.fetch = mockFetch(
        async (_url, init) => {
          capturedHeaders = new Headers(init?.headers);
          return new Response("ok", { status: 200 });
        },
      );
      const r = await cronTriggerHandler({
        authorization: "Bearer test-secret",
      });
      expect(r.status).toBe(200);
      expect(r.kind).toBe("json");
      // Tightened: pin the entire summary shape (total/triggered/
      // skipped/failed). Asserting only `triggered` lets a regression
      // pass that wrongly counted the same project as both triggered
      // AND failed, or that lost the `total` field entirely.
      if (r.kind === "json") {
        expect(r.body).toEqual({
          total: 1,
          triggered: 1,
          skipped: 0,
          failed: 0,
        });
      }
      // Also verify the outbound webhook fetch was called with the
      // configured auth header (X-Key: secret). A regression that
      // forgets to forward auto_backup_header_key/value would silently
      // pass the summary-only assertion above.
      expect(capturedHeaders?.get("X-Key")).toBe("secret");
    });

    test("counts non-2xx as failed", async () => {
      mockIsUrlSafe = () => true;
      mockResolveAndValidateUrl = async () => ({ safe: true });
      mockListAutoBackupProjects = async () => [
        {
          id: "p1",
          auto_backup_webhook: "https://hook.example.com",
          auto_backup_interval: 1,
          auto_backup_header_key: null,
          auto_backup_header_value: null,
        },
      ];
      globalThis.fetch = mockFetch(
        async () => new Response("nope", { status: 500 }),
      );
      const r = await cronTriggerHandler({
        authorization: "Bearer test-secret",
      });
      expect(r.status).toBe(200);
      expect(r.kind).toBe("json");
      if (r.kind === "json") {
        // Tightened: pin the full summary instead of just `failed`.
        // Catches a regression that double-counts (failed:1, triggered:1)
        // or counts the failure as 'skipped' instead.
        expect(r.body).toEqual({
          total: 1,
          triggered: 0,
          skipped: 0,
          failed: 1,
        });
      }
    });

    test("counts thrown fetch as failed", async () => {
      mockIsUrlSafe = () => true;
      mockResolveAndValidateUrl = async () => ({ safe: true });
      mockListAutoBackupProjects = async () => [
        {
          id: "p1",
          auto_backup_webhook: "https://hook.example.com",
          auto_backup_interval: 1,
          auto_backup_header_key: null,
          auto_backup_header_value: null,
        },
      ];
      globalThis.fetch = mockFetch(async () => {
        throw new Error("network");
      });
      const r = await cronTriggerHandler({
        authorization: "Bearer test-secret",
      });
      expect(r.status).toBe(200);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        expect(r.body).toEqual({
          total: 1,
          triggered: 0,
          skipped: 0,
          failed: 1,
        });
    });
  });

  describe("cronTriggerOneHandler", () => {
    test("500 when getProject throws", async () => {
      mockGetProject = async () => {
        throw new Error("db");
      };
      const r = await cronTriggerOneHandler({ projectId: "p1" });
      expect(r.status).toBe(500);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        expect(r.body).toEqual({ error: "Failed to fetch project" });
    });

    test("404 when project missing", async () => {
      const r = await cronTriggerOneHandler({ projectId: "x" });
      expect(r.status).toBe(404);
      expect(r.kind).toBe("json");
      // Tightened: pin the error body so a regression that returns a
      // generic 404 page or different copy would surface.
      if (r.kind === "json")
        expect(r.body).toEqual({ error: "Project not found" });
    });

    test("400 when no webhook configured", async () => {
      mockGetProject = async () => ({ id: "p1", auto_backup_webhook: null });
      const r = await cronTriggerOneHandler({ projectId: "p1" });
      expect(r.status).toBe(400);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        expect(r.body).toEqual({
          error: "No webhook URL configured for auto-backup",
        });
    });

    test("200 failed when SSRF blocked", async () => {
      mockIsUrlSafe = () => false;
      mockGetProject = async () => ({
        id: "p1",
        auto_backup_webhook: "http://10.0.0.1",
      });
      const r = await cronTriggerOneHandler({ projectId: "p1" });
      expect(r.status).toBe(200);
      expect(r.kind).toBe("json");
      // Tightened: also pin the surfaced error message so a regression
      // that returned a generic 'failed' / wrong reason would fail loudly.
      if (r.kind === "json")
        expect(r.body).toEqual({
          status: "failed",
          error: "Webhook URL is not allowed (must be HTTPS, public hostname)",
        });
    });

    test("200 failed when DNS check fails", async () => {
      mockIsUrlSafe = () => true;
      mockResolveAndValidateUrl = async () => ({
        safe: false,
        reason: "private",
      });
      mockGetProject = async () => ({
        id: "p1",
        auto_backup_webhook: "https://hook.example.com",
      });
      const r = await cronTriggerOneHandler({ projectId: "p1" });
      expect(r.status).toBe(200);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        expect(r.body).toEqual({
          status: "failed",
          error: "Webhook URL blocked: private",
        });
    });

    test("200 success when fetch ok", async () => {
      mockIsUrlSafe = () => true;
      mockResolveAndValidateUrl = async () => ({ safe: true });
      mockGetProject = async () => ({
        id: "p1",
        auto_backup_webhook: "https://hook.example.com",
        auto_backup_header_key: "X-K",
        auto_backup_header_value: "v",
      });
      let capturedHeaders: Headers | undefined;
      globalThis.fetch = mockFetch(async (_url, init) => {
        capturedHeaders = new Headers(init?.headers);
        return new Response("ok");
      });
      const r = await cronTriggerOneHandler({ projectId: "p1" });
      expect(r.status).toBe(200);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        // Tightened: pin status='success' AND responseCode=200 AND that
        // durationMs is a number (timing-dependent so any-number, not
        // an exact value). Verifies the success body includes both the
        // upstream HTTP code and the duration measurement.
        expect(r.body).toEqual({
          status: "success",
          responseCode: 200,
          durationMs: expect.any(Number),
        });
      // Same auth-header forwarding contract as the cronTriggerHandler
      // test — a regression that drops headers in the one-shot path
      // would surface here.
      expect(capturedHeaders?.get("X-K")).toBe("v");
    });

    test("200 failed when fetch returns 500", async () => {
      mockIsUrlSafe = () => true;
      mockResolveAndValidateUrl = async () => ({ safe: true });
      mockGetProject = async () => ({
        id: "p1",
        auto_backup_webhook: "https://hook.example.com",
      });
      globalThis.fetch = mockFetch(
        async () => new Response("oops", { status: 502 }),
      );
      const r = await cronTriggerOneHandler({ projectId: "p1" });
      expect(r.status).toBe(200);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        expect(r.body).toEqual({
          status: "failed",
          responseCode: 502,
          error: "oops",
          durationMs: expect.any(Number),
        });
    });

    test("200 failed when fetch throws", async () => {
      mockIsUrlSafe = () => true;
      mockResolveAndValidateUrl = async () => ({ safe: true });
      mockGetProject = async () => ({
        id: "p1",
        auto_backup_webhook: "https://hook.example.com",
      });
      globalThis.fetch = mockFetch(async () => {
        throw new Error("net");
      });
      const r = await cronTriggerOneHandler({ projectId: "p1" });
      expect(r.status).toBe(200);
      // Tightened: pin the body shape so a regression that surfaces a
      // generic 'failed' or wrong message would fail loudly. fetch-throw
      // path has no responseCode (only error+durationMs).
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        expect(r.body).toEqual({
          status: "failed",
          error: "net",
          durationMs: expect.any(Number),
        });
    });
  });
});
