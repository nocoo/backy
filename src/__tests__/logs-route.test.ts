import { describe, expect, test, beforeEach, mock } from "bun:test";
import { WEBHOOK_LOG_STUBS } from "./helpers";
import { NextRequest } from "next/server";

// --- Mutable mock state ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockListWebhookLogs: (...args: any[]) => Promise<any> = async () => ({
  items: [],
  total: 0,
  page: 1,
  pageSize: 50,
  totalPages: 0,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockDeleteWebhookLogs: (...args: any[]) => Promise<void> = async () => {};

mock.module("@/lib/db/webhook-logs", () => ({
  ...WEBHOOK_LOG_STUBS,
  listWebhookLogs: (...args: unknown[]) => mockListWebhookLogs(...args),
  deleteWebhookLogs: (...args: unknown[]) => mockDeleteWebhookLogs(...args),
}));

const { GET, DELETE } = await import("@/app/api/logs/route");

// --- Helpers ---

function makeRequest(path: string, init?: RequestInit) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new NextRequest(new URL(path, "http://localhost:7026"), init as any);
}

describe("/api/logs", () => {
  beforeEach(() => {
    mockListWebhookLogs = async () => ({
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
      totalPages: 0,
    });
    mockDeleteWebhookLogs = async () => {};
  });

  // -----------------------------------------------------------------------
  // GET
  // -----------------------------------------------------------------------

  describe("GET", () => {
    test("returns paginated webhook logs", async () => {
      mockListWebhookLogs = async () => ({
        items: [{ id: "log-1" }],
        total: 1,
        page: 1,
        pageSize: 50,
        totalPages: 1,
      });

      const res = await GET(makeRequest("/api/logs"));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.items).toHaveLength(1);
      expect(body.total).toBe(1);
    });

    test("passes all filter params", async () => {
      let captured: Record<string, unknown> = {};
      mockListWebhookLogs = async (opts: unknown) => {
        captured = opts as Record<string, unknown>;
        return { items: [], total: 0, page: 1, pageSize: 50, totalPages: 0 };
      };

      await GET(
        makeRequest(
          "/api/logs?projectId=p1&excludeProjectIds=p2,p3&excludeClientIps=1.1.1.1&method=POST&statusCode=201&errorCode=AUTH&success=true&page=2&pageSize=25",
        ),
      );

      expect(captured.projectId).toBe("p1");
      expect(captured.excludeProjectIds).toEqual(["p2", "p3"]);
      expect(captured.excludeClientIps).toEqual(["1.1.1.1"]);
      expect(captured.method).toBe("POST");
      expect(captured.statusCode).toBe(201);
      expect(captured.errorCode).toBe("AUTH");
      expect(captured.success).toBe(true);
      expect(captured.page).toBe(2);
      expect(captured.pageSize).toBe(25);
    });

    test("parses success=false correctly", async () => {
      let captured: Record<string, unknown> = {};
      mockListWebhookLogs = async (opts: unknown) => {
        captured = opts as Record<string, unknown>;
        return { items: [], total: 0, page: 1, pageSize: 50, totalPages: 0 };
      };

      await GET(makeRequest("/api/logs?success=false"));
      expect(captured.success).toBe(false);
    });

    test("clamps pageSize to 100", async () => {
      let captured: Record<string, unknown> = {};
      mockListWebhookLogs = async (opts: unknown) => {
        captured = opts as Record<string, unknown>;
        return { items: [], total: 0, page: 1, pageSize: 50, totalPages: 0 };
      };

      await GET(makeRequest("/api/logs?pageSize=999"));
      expect(captured.pageSize).toBe(100);
    });

    test("returns 500 on error", async () => {
      mockListWebhookLogs = async () => {
        throw new Error("db down");
      };

      const res = await GET(makeRequest("/api/logs"));
      expect(res.status).toBe(500);
    });
  });

  // -----------------------------------------------------------------------
  // DELETE
  // -----------------------------------------------------------------------

  describe("DELETE", () => {
    test("deletes logs with filters", async () => {
      let captured: Record<string, unknown> = {};
      mockDeleteWebhookLogs = async (opts: unknown) => {
        captured = opts as Record<string, unknown>;
      };

      const res = await DELETE(
        makeRequest("/api/logs", {
          method: "DELETE",
          body: JSON.stringify({ projectId: "p1", method: "POST", success: false }),
          headers: { "Content-Type": "application/json" },
        }),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(captured.projectId).toBe("p1");
      expect(captured.method).toBe("POST");
      expect(captured.success).toBe(false);
    });

    test("deletes all logs when no filters", async () => {
      const res = await DELETE(
        makeRequest("/api/logs", {
          method: "DELETE",
          body: JSON.stringify({}),
          headers: { "Content-Type": "application/json" },
        }),
      );

      expect(res.status).toBe(200);
    });

    test("handles missing body gracefully", async () => {
      const res = await DELETE(
        makeRequest("/api/logs", { method: "DELETE" }),
      );
      // Should not crash — body defaults to {}
      expect(res.status).toBe(200);
    });

    test("returns 500 on error", async () => {
      mockDeleteWebhookLogs = async () => {
        throw new Error("db error");
      };

      const res = await DELETE(
        makeRequest("/api/logs", {
          method: "DELETE",
          body: JSON.stringify({}),
          headers: { "Content-Type": "application/json" },
        }),
      );
      expect(res.status).toBe(500);
    });
  });
});
