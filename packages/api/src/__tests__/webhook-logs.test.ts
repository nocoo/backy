import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  createWebhookLog as createWebhookLogRaw,
  deleteWebhookLogs as deleteWebhookLogsRaw,
  listWebhookLogs as listWebhookLogsRaw,
} from "@backy/api/db/webhook-logs";
import { makeMockD1 } from "./helpers";

describe("webhook-logs", () => {
  let db: ReturnType<typeof makeMockD1>;

  const createWebhookLog = (
    input: Parameters<typeof createWebhookLogRaw>[1],
  ) => createWebhookLogRaw(db, input);
  const listWebhookLogs = (
    options?: Parameters<typeof listWebhookLogsRaw>[1],
  ) => listWebhookLogsRaw(db, options);
  const deleteWebhookLogs = (
    options?: Parameters<typeof deleteWebhookLogsRaw>[1],
  ) => deleteWebhookLogsRaw(db, options);

  beforeEach(() => {
    db = makeMockD1();
  });

  describe("createWebhookLog", () => {
    test("inserts a log entry with all fields", async () => {
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

      const insert = db.calls[0];
      expect(insert?.sql).toContain("INSERT INTO webhook_logs");
      expect(insert?.params[1]).toBe("proj-123");
      expect(insert?.params[2]).toBe("POST");
      expect(insert?.params[3]).toBe("/api/webhook/proj-123");
      expect(insert?.params[4]).toBe(201);
      expect(insert?.params[5]).toBe("1.2.3.4");
      expect(insert?.params[6]).toBe("TestAgent/1.0");
      expect(insert?.params[7]).toBeNull();
      expect(insert?.params[8]).toBeNull();
      expect(insert?.params[9]).toBe(42);
      expect(JSON.parse(insert?.params[10] as string)).toEqual({
        backup_id: "bk-1",
        file_size: 1024,
      });
    });

    test("inserts a log entry with null project_id and error", async () => {
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

      const insert = db.calls[0];
      expect(insert?.params[1]).toBeNull();
      expect(insert?.params[5]).toBeNull();
      expect(insert?.params[6]).toBeNull();
      expect(insert?.params[7]).toBe("auth_missing");
      expect(insert?.params[8]).toBe("Missing Authorization header");
      expect(insert?.params[10]).toBeNull();
    });

    test("does not throw on D1 failure (fire-and-forget)", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      db = makeMockD1(async () => {
        throw new Error("database locked");
      });

      await expect(
        createWebhookLog({
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
        }),
      ).resolves.toBeUndefined();

      // The underlying D1 failure must surface in console.error so it shows
      // up in worker logs even though the caller treats it as fire-and-forget.
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const [, err] = consoleSpy.mock.calls[0]!;
      expect((err as Error).message).toBe("database locked");
      consoleSpy.mockRestore();
    });

    test("does not throw on network failure", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      db = makeMockD1(async () => {
        throw new Error("Network unreachable");
      });

      await expect(
        createWebhookLog({
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
        }),
      ).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const [, err] = consoleSpy.mock.calls[0]!;
      expect((err as Error).message).toBe("Network unreachable");
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
      db = makeMockD1(async () => {
        callCount++;
        if (callCount === 1) return { results: [{ count: 1 }] };
        return { results: mockLogs };
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
      db = makeMockD1(async () => ({ results: [] }));
      await listWebhookLogs({ projectId: "proj-123" });

      const countQuery = db.calls[0];
      expect(countQuery?.sql).toContain("l.project_id = ?");
      expect(countQuery?.params).toContain("proj-123");
    });

    test("filters by method", async () => {
      db = makeMockD1(async () => ({ results: [] }));
      await listWebhookLogs({ method: "post" });

      const countQuery = db.calls[0];
      expect(countQuery?.sql).toContain("l.method = ?");
      expect(countQuery?.params).toContain("POST");
    });

    test("filters by success=true (status < 400)", async () => {
      db = makeMockD1(async () => ({ results: [] }));
      await listWebhookLogs({ success: true });

      const countQuery = db.calls[0];
      expect(countQuery?.sql).toContain("l.status_code < 400");
    });

    test("filters by success=false (status >= 400)", async () => {
      db = makeMockD1(async () => ({ results: [] }));
      await listWebhookLogs({ success: false });

      const countQuery = db.calls[0];
      expect(countQuery?.sql).toContain("l.status_code >= 400");
    });

    test("filters by statusCode", async () => {
      db = makeMockD1(async () => ({ results: [] }));
      await listWebhookLogs({ statusCode: 403 });

      const countQuery = db.calls[0];
      expect(countQuery?.sql).toContain("l.status_code = ?");
      expect(countQuery?.params).toContain(403);
    });

    test("paginates correctly", async () => {
      let callCount = 0;
      db = makeMockD1(async () => {
        callCount++;
        if (callCount === 1) return { results: [{ count: 120 }] };
        return { results: [] };
      });

      const result = await listWebhookLogs({ page: 3, pageSize: 20 });

      expect(result.total).toBe(120);
      expect(result.page).toBe(3);
      expect(result.pageSize).toBe(20);
      expect(result.totalPages).toBe(6);

      const selectQuery = db.calls[1];
      expect(selectQuery?.params).toContain(20);
      expect(selectQuery?.params).toContain(40);
    });
  });

  describe("listWebhookLogs — excludeProjectIds", () => {
    test("adds exclude condition when excludeProjectIds has one entry", async () => {
      db = makeMockD1(async () => ({ results: [] }));
      await listWebhookLogs({ excludeProjectIds: ["proj-guntest"] });

      const countQuery = db.calls[0];
      expect(countQuery?.sql).toContain("NOT IN (?)");
      expect(countQuery?.params).toContain("proj-guntest");
    });

    test("adds exclude condition with multiple IDs", async () => {
      db = makeMockD1(async () => ({ results: [] }));
      await listWebhookLogs({ excludeProjectIds: ["proj-a", "proj-b"] });

      const countQuery = db.calls[0];
      expect(countQuery?.sql).toContain("NOT IN (?, ?)");
      expect(countQuery?.params).toContain("proj-a");
      expect(countQuery?.params).toContain("proj-b");
    });

    test("does not add exclude condition when excludeProjectIds is undefined", async () => {
      db = makeMockD1(async () => ({ results: [] }));
      await listWebhookLogs({});

      const countQuery = db.calls[0];
      expect(countQuery?.sql).not.toContain("NOT IN");
    });

    test("does not add exclude condition when excludeProjectIds is empty", async () => {
      db = makeMockD1(async () => ({ results: [] }));
      await listWebhookLogs({ excludeProjectIds: [] });

      const countQuery = db.calls[0];
      expect(countQuery?.sql).not.toContain("NOT IN");
    });
  });

  describe("listWebhookLogs — excludeClientIps", () => {
    test("adds exclude condition when excludeClientIps has one entry", async () => {
      db = makeMockD1(async () => ({ results: [] }));
      await listWebhookLogs({ excludeClientIps: ["::1"] });

      const countQuery = db.calls[0];
      expect(countQuery?.sql).toContain("NOT IN (?)");
      expect(countQuery?.params).toContain("::1");
    });

    test("adds exclude condition with multiple IPs", async () => {
      db = makeMockD1(async () => ({ results: [] }));
      await listWebhookLogs({ excludeClientIps: ["::1", "127.0.0.1"] });

      const countQuery = db.calls[0];
      expect(countQuery?.sql).toContain("NOT IN (?, ?)");
      expect(countQuery?.params).toContain("::1");
      expect(countQuery?.params).toContain("127.0.0.1");
    });

    test("does not add exclude condition when excludeClientIps is empty", async () => {
      db = makeMockD1(async () => ({ results: [] }));
      await listWebhookLogs({ excludeClientIps: [] });

      const countQuery = db.calls[0];
      expect(countQuery?.sql).not.toContain("client_ip NOT IN");
    });

    test("combines excludeProjectIds and excludeClientIps", async () => {
      db = makeMockD1(async () => ({ results: [] }));
      await listWebhookLogs({
        excludeProjectIds: ["proj-test"],
        excludeClientIps: ["::1"],
      });

      const countQuery = db.calls[0];
      expect(countQuery?.sql).toContain("project_id");
      expect(countQuery?.sql).toContain("client_ip");
      expect(countQuery?.params).toContain("proj-test");
      expect(countQuery?.params).toContain("::1");
    });
  });

  describe("deleteWebhookLogs", () => {
    test("deletes all logs when no filters provided", async () => {
      await deleteWebhookLogs();

      const deleteQuery = db.calls[0];
      expect(deleteQuery?.sql).toBe("DELETE FROM webhook_logs ");
      expect(deleteQuery?.params).toEqual([]);
    });

    test("deletes logs filtered by projectId", async () => {
      await deleteWebhookLogs({ projectId: "proj-123" });

      const deleteQuery = db.calls[0];
      expect(deleteQuery?.sql).toContain("WHERE project_id = ?");
      expect(deleteQuery?.params).toContain("proj-123");
    });

    test("deletes logs filtered by method", async () => {
      await deleteWebhookLogs({ method: "post" });

      const deleteQuery = db.calls[0];
      expect(deleteQuery?.sql).toContain("method = ?");
      expect(deleteQuery?.params).toContain("POST");
    });

    test("deletes logs filtered by success=true", async () => {
      await deleteWebhookLogs({ success: true });

      const deleteQuery = db.calls[0];
      expect(deleteQuery?.sql).toContain("status_code < 400");
    });

    test("deletes logs filtered by success=false", async () => {
      await deleteWebhookLogs({ success: false });

      const deleteQuery = db.calls[0];
      expect(deleteQuery?.sql).toContain("status_code >= 400");
    });

    test("combines multiple filters", async () => {
      await deleteWebhookLogs({
        projectId: "proj-123",
        method: "HEAD",
        success: false,
      });

      const deleteQuery = db.calls[0];
      expect(deleteQuery?.sql).toContain("project_id = ?");
      expect(deleteQuery?.sql).toContain("method = ?");
      expect(deleteQuery?.sql).toContain("status_code >= 400");
      expect(deleteQuery?.params).toContain("proj-123");
      expect(deleteQuery?.params).toContain("HEAD");
    });
  });
});
