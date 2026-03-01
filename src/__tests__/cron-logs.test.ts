import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  createCronLog,
  listCronLogs,
  deleteCronLogs,
} from "@/lib/db/cron-logs";

/** Create a mock fetch that satisfies Bun's typeof fetch (includes preconnect). */
function mockFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): typeof globalThis.fetch {
  const fn = handler as typeof globalThis.fetch;
  fn.preconnect = () => {};
  return fn;
}

/** Create a successful D1 response. */
function d1Success<T>(results: T[] = []) {
  return new Response(
    JSON.stringify({
      success: true,
      result: [{ results, success: true, meta: { changes: 0, last_row_id: 0 } }],
      errors: [],
    }),
    { status: 200 },
  );
}

describe("cron-logs", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("createCronLog", () => {
    test("inserts a log entry with all fields", async () => {
      let capturedBody = "";

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBody = init?.body as string;
        return d1Success();
      });

      await createCronLog({
        projectId: "proj-123",
        status: "success",
        responseCode: 200,
        error: null,
        durationMs: 150,
      });

      const body = JSON.parse(capturedBody);
      expect(body.sql).toContain("INSERT INTO cron_logs");
      const params = body.params;
      expect(params[1]).toBe("proj-123"); // project_id
      expect(params[2]).toBe("success"); // status
      expect(params[3]).toBe(200); // response_code
      expect(params[4]).toBeNull(); // error
      expect(params[5]).toBe(150); // duration_ms
    });

    test("inserts a log entry with minimal fields", async () => {
      let capturedBody = "";

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBody = init?.body as string;
        return d1Success();
      });

      await createCronLog({
        projectId: "proj-456",
        status: "skipped",
      });

      const body = JSON.parse(capturedBody);
      const params = body.params;
      expect(params[1]).toBe("proj-456"); // project_id
      expect(params[2]).toBe("skipped"); // status
      expect(params[3]).toBeNull(); // response_code
      expect(params[4]).toBeNull(); // error
      expect(params[5]).toBeNull(); // duration_ms
    });

    test("inserts a failed log entry with error message", async () => {
      let capturedBody = "";

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBody = init?.body as string;
        return d1Success();
      });

      await createCronLog({
        projectId: "proj-789",
        status: "failed",
        responseCode: 500,
        error: "Internal Server Error",
        durationMs: 3000,
      });

      const body = JSON.parse(capturedBody);
      const params = body.params;
      expect(params[2]).toBe("failed");
      expect(params[3]).toBe(500);
      expect(params[4]).toBe("Internal Server Error");
      expect(params[5]).toBe(3000);
    });
  });

  describe("listCronLogs", () => {
    test("returns paginated results with default options", async () => {
      const mockLogs = [
        {
          id: "clog-1",
          project_id: "proj-123",
          project_name: "Test Project",
          status: "success",
          response_code: 200,
          error: null,
          duration_ms: 100,
          triggered_at: "2026-03-01T10:00:00.000Z",
        },
      ];

      let callCount = 0;
      globalThis.fetch = mockFetch(async () => {
        callCount++;
        if (callCount === 1) return d1Success([{ count: 1 }]);
        return d1Success(mockLogs);
      });

      const result = await listCronLogs();
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(50);
      expect(result.totalPages).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe("clog-1");
      expect(result.items[0]!.project_name).toBe("Test Project");
    });

    test("filters by projectId", async () => {
      const capturedBodies: string[] = [];

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBodies.push(init?.body as string);
        return d1Success(capturedBodies.length === 1 ? [{ count: 0 }] : []);
      });

      await listCronLogs({ projectId: "proj-123" });

      const countBody = JSON.parse(capturedBodies[0]!);
      expect(countBody.sql).toContain("c.project_id = ?");
      expect(countBody.params).toContain("proj-123");
    });

    test("filters by status", async () => {
      const capturedBodies: string[] = [];

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBodies.push(init?.body as string);
        return d1Success(capturedBodies.length === 1 ? [{ count: 0 }] : []);
      });

      await listCronLogs({ status: "failed" });

      const countBody = JSON.parse(capturedBodies[0]!);
      expect(countBody.sql).toContain("c.status = ?");
      expect(countBody.params).toContain("failed");
    });

    test("combines projectId and status filters", async () => {
      const capturedBodies: string[] = [];

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBodies.push(init?.body as string);
        return d1Success(capturedBodies.length === 1 ? [{ count: 0 }] : []);
      });

      await listCronLogs({ projectId: "proj-abc", status: "success" });

      const countBody = JSON.parse(capturedBodies[0]!);
      expect(countBody.sql).toContain("c.project_id = ?");
      expect(countBody.sql).toContain("c.status = ?");
      expect(countBody.params).toContain("proj-abc");
      expect(countBody.params).toContain("success");
    });

    test("paginates correctly", async () => {
      const capturedBodies: string[] = [];

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBodies.push(init?.body as string);
        return d1Success(capturedBodies.length === 1 ? [{ count: 100 }] : []);
      });

      const result = await listCronLogs({ page: 3, pageSize: 20 });

      expect(result.total).toBe(100);
      expect(result.page).toBe(3);
      expect(result.pageSize).toBe(20);
      expect(result.totalPages).toBe(5);

      const selectBody = JSON.parse(capturedBodies[1]!);
      expect(selectBody.params).toContain(20); // LIMIT
      expect(selectBody.params).toContain(40); // OFFSET = (3-1)*20
    });

    test("joins project name in query", async () => {
      const capturedBodies: string[] = [];

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBodies.push(init?.body as string);
        return d1Success(capturedBodies.length === 1 ? [{ count: 0 }] : []);
      });

      await listCronLogs();

      const selectBody = JSON.parse(capturedBodies[1]!);
      expect(selectBody.sql).toContain("LEFT JOIN projects p ON c.project_id = p.id");
      expect(selectBody.sql).toContain("p.name as project_name");
    });

    test("orders by triggered_at DESC", async () => {
      const capturedBodies: string[] = [];

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBodies.push(init?.body as string);
        return d1Success(capturedBodies.length === 1 ? [{ count: 0 }] : []);
      });

      await listCronLogs();

      const selectBody = JSON.parse(capturedBodies[1]!);
      expect(selectBody.sql).toContain("ORDER BY c.triggered_at DESC");
    });
  });

  describe("deleteCronLogs", () => {
    test("deletes all logs when no filters provided", async () => {
      let capturedBody = "";

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBody = init?.body as string;
        return d1Success();
      });

      await deleteCronLogs();

      const body = JSON.parse(capturedBody);
      expect(body.sql).toContain("DELETE FROM cron_logs");
      expect(body.params).toEqual([]);
    });

    test("deletes logs filtered by projectId", async () => {
      let capturedBody = "";

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBody = init?.body as string;
        return d1Success();
      });

      await deleteCronLogs({ projectId: "proj-123" });

      const body = JSON.parse(capturedBody);
      expect(body.sql).toContain("WHERE project_id = ?");
      expect(body.params).toContain("proj-123");
    });

    test("deletes logs filtered by status", async () => {
      let capturedBody = "";

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBody = init?.body as string;
        return d1Success();
      });

      await deleteCronLogs({ status: "failed" });

      const body = JSON.parse(capturedBody);
      expect(body.sql).toContain("WHERE status = ?");
      expect(body.params).toContain("failed");
    });

    test("combines multiple filters", async () => {
      let capturedBody = "";

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBody = init?.body as string;
        return d1Success();
      });

      await deleteCronLogs({ projectId: "proj-123", status: "skipped" });

      const body = JSON.parse(capturedBody);
      expect(body.sql).toContain("project_id = ?");
      expect(body.sql).toContain("status = ?");
      expect(body.params).toContain("proj-123");
      expect(body.params).toContain("skipped");
    });
  });
});
