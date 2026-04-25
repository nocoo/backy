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
    });

    test("401 when no auth", async () => {
      const r = await cronTriggerHandler({ authorization: null });
      expect(r.status).toBe(401);
    });

    test("401 when wrong token", async () => {
      const r = await cronTriggerHandler({
        authorization: "Bearer wrong",
      });
      expect(r.status).toBe(401);
    });

    test("500 when listAutoBackupProjects throws", async () => {
      mockListAutoBackupProjects = async () => {
        throw new Error("db");
      };
      const r = await cronTriggerHandler({
        authorization: "Bearer test-secret",
      });
      expect(r.status).toBe(500);
    });

    test("200 with empty projects", async () => {
      const r = await cronTriggerHandler({
        authorization: "Bearer test-secret",
      });
      expect(r.status).toBe(200);
    });

    test("skips project without webhook URL", async () => {
      mockListAutoBackupProjects = async () => [
        { id: "p1", auto_backup_webhook: "", auto_backup_interval: 1 },
      ];
      const r = await cronTriggerHandler({
        authorization: "Bearer test-secret",
      });
      expect(r.status).toBe(200);
    });

    test("skips project not due this hour", async () => {
      mockIsUrlSafe = () => true;
      mockResolveAndValidateUrl = async () => ({ safe: true });
      mockListAutoBackupProjects = async () => [
        {
          id: "p1",
          auto_backup_webhook: "https://hook.example.com",
          auto_backup_interval: 999, // invalid → never triggers
          auto_backup_header_key: null,
          auto_backup_header_value: null,
        },
      ];
      const r = await cronTriggerHandler({
        authorization: "Bearer test-secret",
      });
      expect(r.status).toBe(200);
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
      globalThis.fetch = mockFetch(
        async () => new Response("ok", { status: 200 }),
      );
      const r = await cronTriggerHandler({
        authorization: "Bearer test-secret",
      });
      expect(r.status).toBe(200);
      if (r.kind === "json") {
        expect((r.body as { triggered: number }).triggered).toBe(1);
      }
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
      if (r.kind === "json") {
        expect((r.body as { failed: number }).failed).toBe(1);
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
    });
  });

  describe("cronTriggerOneHandler", () => {
    test("500 when getProject throws", async () => {
      mockGetProject = async () => {
        throw new Error("db");
      };
      const r = await cronTriggerOneHandler({ projectId: "p1" });
      expect(r.status).toBe(500);
    });

    test("404 when project missing", async () => {
      const r = await cronTriggerOneHandler({ projectId: "x" });
      expect(r.status).toBe(404);
    });

    test("400 when no webhook configured", async () => {
      mockGetProject = async () => ({ id: "p1", auto_backup_webhook: null });
      const r = await cronTriggerOneHandler({ projectId: "p1" });
      expect(r.status).toBe(400);
    });

    test("200 failed when SSRF blocked", async () => {
      mockIsUrlSafe = () => false;
      mockGetProject = async () => ({
        id: "p1",
        auto_backup_webhook: "http://10.0.0.1",
      });
      const r = await cronTriggerOneHandler({ projectId: "p1" });
      expect(r.status).toBe(200);
      if (r.kind === "json")
        expect((r.body as { status: string }).status).toBe("failed");
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
      if (r.kind === "json")
        expect((r.body as { status: string }).status).toBe("failed");
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
      globalThis.fetch = mockFetch(async () => new Response("ok"));
      const r = await cronTriggerOneHandler({ projectId: "p1" });
      expect(r.status).toBe(200);
      if (r.kind === "json")
        expect((r.body as { status: string }).status).toBe("success");
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
      if (r.kind === "json")
        expect((r.body as { status: string }).status).toBe("failed");
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
    });
  });
});
