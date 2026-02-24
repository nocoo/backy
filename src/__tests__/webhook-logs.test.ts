import { describe, expect, test, beforeEach, afterEach, spyOn } from "bun:test";
import {
  createWebhookLog,
  listWebhookLogs,
  getWebhookLog,
  purgeWebhookLogs,
  deleteWebhookLogs,
} from "@/lib/db/webhook-logs";

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

/** Create a failed D1 response. */
function d1Error(message: string) {
  return new Response(
    JSON.stringify({
      success: false,
      result: [],
      errors: [{ message }],
    }),
    { status: 200 },
  );
}

describe("webhook-logs", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("createWebhookLog", () => {
    test("inserts a log entry with all fields", async () => {
      let capturedBody = "";

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBody = init?.body as string;
        return d1Success();
      });

      await createWebhookLog({
        projectId: "proj-123",
        method: "POST",
        path: "/api/webhook/proj-123",
        statusCode: 201,
        clientIp: "1.2.3.4",
        userAgent: "TestAgent/1.0",
        errorCode: null,
        errorMessage: null,
        durationMs: 42,
        metadata: { backup_id: "bk-1", file_size: 1024 },
      });

      const body = JSON.parse(capturedBody);
      expect(body.sql).toContain("INSERT INTO webhook_logs");
      // Verify params order: id, project_id, method, path, status_code, client_ip,
      // user_agent, error_code, error_message, duration_ms, metadata, created_at
      const params = body.params;
      expect(params[1]).toBe("proj-123");       // project_id
      expect(params[2]).toBe("POST");            // method
      expect(params[3]).toBe("/api/webhook/proj-123"); // path
      expect(params[4]).toBe(201);               // status_code
      expect(params[5]).toBe("1.2.3.4");         // client_ip
      expect(params[6]).toBe("TestAgent/1.0");   // user_agent
      expect(params[7]).toBeNull();              // error_code
      expect(params[8]).toBeNull();              // error_message
      expect(params[9]).toBe(42);                // duration_ms
      expect(JSON.parse(params[10])).toEqual({ backup_id: "bk-1", file_size: 1024 });
    });

    test("inserts a log entry with null project_id and error", async () => {
      let capturedBody = "";

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBody = init?.body as string;
        return d1Success();
      });

      await createWebhookLog({
        projectId: null,
        method: "HEAD",
        path: "/api/webhook/unknown",
        statusCode: 401,
        clientIp: null,
        userAgent: null,
        errorCode: "auth_missing",
        errorMessage: "Missing Authorization header",
        durationMs: 1,
        metadata: null,
      });

      const body = JSON.parse(capturedBody);
      const params = body.params;
      expect(params[1]).toBeNull();              // project_id
      expect(params[5]).toBeNull();              // client_ip
      expect(params[6]).toBeNull();              // user_agent
      expect(params[7]).toBe("auth_missing");    // error_code
      expect(params[8]).toBe("Missing Authorization header");
      expect(params[10]).toBeNull();             // metadata
    });

    test("does not throw on D1 failure (fire-and-forget)", async () => {
      const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

      globalThis.fetch = mockFetch(async () => d1Error("database locked"));

      // Should NOT throw
      await createWebhookLog({
        projectId: null,
        method: "POST",
        path: "/api/webhook/test",
        statusCode: 500,
        clientIp: "1.2.3.4",
        userAgent: null,
        errorCode: "internal_error",
        errorMessage: "Something broke",
        durationMs: 100,
        metadata: null,
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test("does not throw on network failure", async () => {
      const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

      globalThis.fetch = mockFetch(async () => {
        throw new Error("Network unreachable");
      });

      await createWebhookLog({
        projectId: null,
        method: "POST",
        path: "/api/webhook/test",
        statusCode: 500,
        clientIp: null,
        userAgent: null,
        errorCode: "internal_error",
        errorMessage: "network down",
        durationMs: 0,
        metadata: null,
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("listWebhookLogs", () => {
    test("returns paginated results with default options", async () => {
      const mockLogs = [
        {
          id: "log-1",
          project_id: "proj-123",
          project_name: "My Project",
          method: "POST",
          path: "/api/webhook/proj-123",
          status_code: 201,
          client_ip: "1.2.3.4",
          user_agent: "Agent/1.0",
          error_code: null,
          error_message: null,
          duration_ms: 50,
          metadata: '{"backup_id":"bk-1"}',
          created_at: "2026-02-24T10:00:00.000Z",
        },
      ];

      let callCount = 0;
      globalThis.fetch = mockFetch(async () => {
        callCount++;
        if (callCount === 1) {
          // COUNT query
          return d1Success([{ count: 1 }]);
        }
        // SELECT query
        return d1Success(mockLogs);
      });

      const result = await listWebhookLogs();
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(50);
      expect(result.totalPages).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe("log-1");
      expect(result.items[0]!.project_name).toBe("My Project");
    });

    test("filters by projectId", async () => {
      const capturedBodies: string[] = [];

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBodies.push(init?.body as string);
        return d1Success(capturedBodies.length === 1 ? [{ count: 0 }] : []);
      });

      await listWebhookLogs({ projectId: "proj-123" });

      const countBody = JSON.parse(capturedBodies[0]!);
      expect(countBody.sql).toContain("l.project_id = ?");
      expect(countBody.params).toContain("proj-123");
    });

    test("filters by method", async () => {
      const capturedBodies: string[] = [];

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBodies.push(init?.body as string);
        return d1Success(capturedBodies.length === 1 ? [{ count: 0 }] : []);
      });

      await listWebhookLogs({ method: "post" });

      const countBody = JSON.parse(capturedBodies[0]!);
      expect(countBody.sql).toContain("l.method = ?");
      expect(countBody.params).toContain("POST");
    });

    test("filters by success=true (status < 400)", async () => {
      const capturedBodies: string[] = [];

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBodies.push(init?.body as string);
        return d1Success(capturedBodies.length === 1 ? [{ count: 0 }] : []);
      });

      await listWebhookLogs({ success: true });

      const countBody = JSON.parse(capturedBodies[0]!);
      expect(countBody.sql).toContain("l.status_code < 400");
    });

    test("filters by success=false (status >= 400)", async () => {
      const capturedBodies: string[] = [];

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBodies.push(init?.body as string);
        return d1Success(capturedBodies.length === 1 ? [{ count: 0 }] : []);
      });

      await listWebhookLogs({ success: false });

      const countBody = JSON.parse(capturedBodies[0]!);
      expect(countBody.sql).toContain("l.status_code >= 400");
    });

    test("filters by statusCode", async () => {
      const capturedBodies: string[] = [];

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBodies.push(init?.body as string);
        return d1Success(capturedBodies.length === 1 ? [{ count: 0 }] : []);
      });

      await listWebhookLogs({ statusCode: 403 });

      const countBody = JSON.parse(capturedBodies[0]!);
      expect(countBody.sql).toContain("l.status_code = ?");
      expect(countBody.params).toContain(403);
    });

    test("paginates correctly", async () => {
      const capturedBodies: string[] = [];

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBodies.push(init?.body as string);
        return d1Success(capturedBodies.length === 1 ? [{ count: 120 }] : []);
      });

      const result = await listWebhookLogs({ page: 3, pageSize: 20 });

      expect(result.total).toBe(120);
      expect(result.page).toBe(3);
      expect(result.pageSize).toBe(20);
      expect(result.totalPages).toBe(6);

      // Check OFFSET is (page-1)*pageSize = 40
      const selectBody = JSON.parse(capturedBodies[1]!);
      expect(selectBody.params).toContain(20);  // LIMIT
      expect(selectBody.params).toContain(40);  // OFFSET
    });
  });

  describe("getWebhookLog", () => {
    test("returns a single log by ID with project name", async () => {
      const mockLog = {
        id: "log-99",
        project_id: "proj-123",
        project_name: "Test Project",
        method: "POST",
        path: "/api/webhook/proj-123",
        status_code: 201,
        client_ip: "5.6.7.8",
        user_agent: "MyAgent/2.0",
        error_code: null,
        error_message: null,
        duration_ms: 30,
        metadata: null,
        created_at: "2026-02-24T12:00:00.000Z",
      };

      globalThis.fetch = mockFetch(async () => d1Success([mockLog]));

      const result = await getWebhookLog("log-99");
      expect(result).toBeDefined();
      expect(result!.id).toBe("log-99");
      expect(result!.project_name).toBe("Test Project");
    });

    test("returns undefined when log not found", async () => {
      globalThis.fetch = mockFetch(async () => d1Success([]));

      const result = await getWebhookLog("nonexistent");
      expect(result).toBeUndefined();
    });
  });

  describe("purgeWebhookLogs", () => {
    test("deletes logs older than specified days", async () => {
      let capturedBody = "";

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBody = init?.body as string;
        return d1Success();
      });

      await purgeWebhookLogs(90);

      const body = JSON.parse(capturedBody);
      expect(body.sql).toContain("DELETE FROM webhook_logs WHERE created_at < ?");
      // The cutoff date should be approximately 90 days ago
      const cutoff = new Date(body.params[0]);
      const now = new Date();
      const diffDays = (now.getTime() - cutoff.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThan(89);
      expect(diffDays).toBeLessThan(91);
    });
  });

  describe("listWebhookLogs — excludeProjectIds", () => {
    test("adds exclude condition when excludeProjectIds has one entry", async () => {
      const capturedBodies: string[] = [];

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBodies.push(init?.body as string);
        return d1Success(capturedBodies.length === 1 ? [{ count: 0 }] : []);
      });

      await listWebhookLogs({ excludeProjectIds: ["proj-guntest"] });

      const countBody = JSON.parse(capturedBodies[0]!);
      expect(countBody.sql).toContain("l.project_id NOT IN (?)");
      expect(countBody.params).toContain("proj-guntest");
    });

    test("adds exclude condition with multiple IDs", async () => {
      const capturedBodies: string[] = [];

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBodies.push(init?.body as string);
        return d1Success(capturedBodies.length === 1 ? [{ count: 0 }] : []);
      });

      await listWebhookLogs({ excludeProjectIds: ["proj-a", "proj-b"] });

      const countBody = JSON.parse(capturedBodies[0]!);
      expect(countBody.sql).toContain("l.project_id NOT IN (?, ?)");
      expect(countBody.params).toContain("proj-a");
      expect(countBody.params).toContain("proj-b");
    });

    test("does not add exclude condition when excludeProjectIds is undefined", async () => {
      const capturedBodies: string[] = [];

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBodies.push(init?.body as string);
        return d1Success(capturedBodies.length === 1 ? [{ count: 0 }] : []);
      });

      await listWebhookLogs({});

      const countBody = JSON.parse(capturedBodies[0]!);
      expect(countBody.sql).not.toContain("NOT IN");
    });

    test("does not add exclude condition when excludeProjectIds is empty", async () => {
      const capturedBodies: string[] = [];

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBodies.push(init?.body as string);
        return d1Success(capturedBodies.length === 1 ? [{ count: 0 }] : []);
      });

      await listWebhookLogs({ excludeProjectIds: [] });

      const countBody = JSON.parse(capturedBodies[0]!);
      expect(countBody.sql).not.toContain("NOT IN");
    });
  });

  describe("deleteWebhookLogs", () => {
    test("deletes all logs when no filters provided", async () => {
      let capturedBody = "";

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBody = init?.body as string;
        return d1Success();
      });

      await deleteWebhookLogs();

      const body = JSON.parse(capturedBody);
      expect(body.sql).toBe("DELETE FROM webhook_logs ");
      expect(body.params).toEqual([]);
    });

    test("deletes logs filtered by projectId", async () => {
      let capturedBody = "";

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBody = init?.body as string;
        return d1Success();
      });

      await deleteWebhookLogs({ projectId: "proj-123" });

      const body = JSON.parse(capturedBody);
      expect(body.sql).toContain("WHERE project_id = ?");
      expect(body.params).toContain("proj-123");
    });

    test("deletes logs filtered by method", async () => {
      let capturedBody = "";

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBody = init?.body as string;
        return d1Success();
      });

      await deleteWebhookLogs({ method: "post" });

      const body = JSON.parse(capturedBody);
      expect(body.sql).toContain("method = ?");
      expect(body.params).toContain("POST");
    });

    test("deletes logs filtered by success=true", async () => {
      let capturedBody = "";

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBody = init?.body as string;
        return d1Success();
      });

      await deleteWebhookLogs({ success: true });

      const body = JSON.parse(capturedBody);
      expect(body.sql).toContain("status_code < 400");
    });

    test("deletes logs filtered by success=false", async () => {
      let capturedBody = "";

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBody = init?.body as string;
        return d1Success();
      });

      await deleteWebhookLogs({ success: false });

      const body = JSON.parse(capturedBody);
      expect(body.sql).toContain("status_code >= 400");
    });

    test("combines multiple filters", async () => {
      let capturedBody = "";

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBody = init?.body as string;
        return d1Success();
      });

      await deleteWebhookLogs({ projectId: "proj-123", method: "HEAD", success: false });

      const body = JSON.parse(capturedBody);
      expect(body.sql).toContain("project_id = ?");
      expect(body.sql).toContain("method = ?");
      expect(body.sql).toContain("status_code >= 400");
      expect(body.params).toContain("proj-123");
      expect(body.params).toContain("HEAD");
    });
  });
});
