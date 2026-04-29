import { beforeEach, describe, expect, test } from "vitest";
import {
  createCronLog as createCronLogRaw,
  deleteCronLogs as deleteCronLogsRaw,
  listCronLogs as listCronLogsRaw,
} from "@backy/api/db/cron-logs";
import { makeMockD1 } from "./helpers";

describe("cron-logs", () => {
  let db: ReturnType<typeof makeMockD1>;

  const createCronLog = (
    input: Parameters<typeof createCronLogRaw>[1],
  ) => createCronLogRaw(db, input);
  const listCronLogs = (
    options?: Parameters<typeof listCronLogsRaw>[1],
  ) => listCronLogsRaw(db, options);
  const deleteCronLogs = (
    options?: Parameters<typeof deleteCronLogsRaw>[1],
  ) => deleteCronLogsRaw(db, options);

  beforeEach(() => {
    db = makeMockD1();
  });

  describe("createCronLog", () => {
    test("inserts a log entry with all fields", async () => {
      await createCronLog({
        projectId: "proj-123",
        status: "success",
        responseCode: 200,
        error: null,
        durationMs: 150,
      });

      const insert = db.calls[0];
      expect(insert?.sql).toContain("INSERT INTO cron_logs");
      expect(insert?.params[1]).toBe("proj-123");
      expect(insert?.params[2]).toBe("success");
      expect(insert?.params[3]).toBe(200);
      expect(insert?.params[4]).toBeNull();
      expect(insert?.params[5]).toBe(150);
    });

    test("inserts a log entry with minimal fields", async () => {
      await createCronLog({
        projectId: "proj-456",
        status: "skipped",
      });

      const insert = db.calls[0];
      expect(insert?.params[1]).toBe("proj-456");
      expect(insert?.params[2]).toBe("skipped");
      expect(insert?.params[3]).toBeNull();
      expect(insert?.params[4]).toBeNull();
      expect(insert?.params[5]).toBeNull();
    });

    test("inserts a failed log entry with error message", async () => {
      await createCronLog({
        projectId: "proj-789",
        status: "failed",
        responseCode: 500,
        error: "Internal Server Error",
        durationMs: 3000,
      });

      const insert = db.calls[0];
      expect(insert?.params[2]).toBe("failed");
      expect(insert?.params[3]).toBe(500);
      expect(insert?.params[4]).toBe("Internal Server Error");
      expect(insert?.params[5]).toBe(3000);
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
      db = makeMockD1(async () => {
        callCount++;
        if (callCount === 1) return { results: [{ count: 1 }] };
        return { results: mockLogs };
      });

      const result = await listCronLogs();
      expect(result).toEqual({
        total: 1,
        page: 1,
        pageSize: 50,
        totalPages: 1,
        items: mockLogs,
      });
    });

    test("filters by projectId", async () => {
      db = makeMockD1(async () => ({ results: [] }));
      await listCronLogs({ projectId: "proj-123" });

      const countQuery = db.calls[0];
      expect(countQuery?.sql).toContain("c.project_id = ?");
      expect(countQuery?.params).toEqual(["proj-123"]);
    });

    test("filters by status", async () => {
      db = makeMockD1(async () => ({ results: [] }));
      await listCronLogs({ status: "failed" });

      const countQuery = db.calls[0];
      expect(countQuery?.sql).toContain("c.status = ?");
      expect(countQuery?.params).toEqual(["failed"]);
    });

    test("combines projectId and status filters", async () => {
      db = makeMockD1(async () => ({ results: [] }));
      await listCronLogs({ projectId: "proj-abc", status: "success" });

      const countQuery = db.calls[0];
      expect(countQuery?.sql).toContain("c.project_id = ?");
      expect(countQuery?.sql).toContain("c.status = ?");
      // Tightened: pin params order — projectId BEFORE status (matches
      // source-order in listCronLogs).
      expect(countQuery?.params).toEqual(["proj-abc", "success"]);
    });

    test("paginates correctly", async () => {
      let callCount = 0;
      db = makeMockD1(async () => {
        callCount++;
        if (callCount === 1) return { results: [{ count: 100 }] };
        return { results: [] };
      });

      const result = await listCronLogs({ page: 3, pageSize: 20 });

      expect(result.total).toBe(100);
      expect(result.page).toBe(3);
      expect(result.pageSize).toBe(20);
      expect(result.totalPages).toBe(5);

      const selectQuery = db.calls[1];
      // Tightened: pin LIMIT/OFFSET binding to exact tail (pageSize=20,
      // page=3 ⇒ offset=40). Catches a regression that swaps the order.
      expect(selectQuery?.params).toEqual([20, 40]);
    });

    test("joins project name in query", async () => {
      db = makeMockD1(async () => ({ results: [] }));
      await listCronLogs();

      const selectQuery = db.calls[1];
      expect(selectQuery?.sql).toContain("LEFT JOIN projects p ON c.project_id = p.id");
      expect(selectQuery?.sql).toContain("p.name as project_name");
    });

    test("orders by triggered_at DESC", async () => {
      db = makeMockD1(async () => ({ results: [] }));
      await listCronLogs();

      const selectQuery = db.calls[1];
      expect(selectQuery?.sql).toContain("ORDER BY c.triggered_at DESC");
    });
  });

  describe("deleteCronLogs", () => {
    test("deletes all logs when no filters provided", async () => {
      await deleteCronLogs();

      const deleteQuery = db.calls[0];
      expect(deleteQuery?.sql).toContain("DELETE FROM cron_logs");
      expect(deleteQuery?.params).toEqual([]);
    });

    test("deletes logs filtered by projectId", async () => {
      await deleteCronLogs({ projectId: "proj-123" });

      const deleteQuery = db.calls[0];
      expect(deleteQuery?.sql).toContain("WHERE project_id = ?");
      expect(deleteQuery?.params).toEqual(["proj-123"]);
    });

    test("deletes logs filtered by status", async () => {
      await deleteCronLogs({ status: "failed" });

      const deleteQuery = db.calls[0];
      expect(deleteQuery?.sql).toContain("WHERE status = ?");
      expect(deleteQuery?.params).toEqual(["failed"]);
    });

    test("combines multiple filters", async () => {
      await deleteCronLogs({ projectId: "proj-123", status: "skipped" });

      const deleteQuery = db.calls[0];
      expect(deleteQuery?.sql).toContain("project_id = ?");
      expect(deleteQuery?.sql).toContain("status = ?");
      // Tightened: pin params order — projectId BEFORE status.
      expect(deleteQuery?.params).toEqual(["proj-123", "skipped"]);
    });
  });
});
