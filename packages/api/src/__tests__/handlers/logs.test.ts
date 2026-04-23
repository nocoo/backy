import { describe, expect, test, beforeEach, mock } from "bun:test";
import { WEBHOOK_LOG_STUBS, CRON_LOG_STUBS } from "../helpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockListWebhookLogs: (...a: any[]) => Promise<any> = async () => ({
  items: [],
  total: 0,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockDeleteWebhookLogs: (...a: any[]) => Promise<void> = async () => {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockListCronLogs: (...a: any[]) => Promise<any> = async () => ({
  items: [],
  total: 0,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockDeleteCronLogs: (...a: any[]) => Promise<void> = async () => {};

mock.module("../../lib/db/webhook-logs", () => ({
  ...WEBHOOK_LOG_STUBS,
  listWebhookLogs: (...a: unknown[]) => mockListWebhookLogs(...a),
  deleteWebhookLogs: (...a: unknown[]) => mockDeleteWebhookLogs(...a),
}));

mock.module("../../lib/db/cron-logs", () => ({
  ...CRON_LOG_STUBS,
  listCronLogs: (...a: unknown[]) => mockListCronLogs(...a),
  deleteCronLogs: (...a: unknown[]) => mockDeleteCronLogs(...a),
}));

const {
  listWebhookLogsHandler,
  deleteWebhookLogsHandler,
  listCronLogsHandler,
  deleteCronLogsHandler,
} = await import("../../handlers/logs");

describe("logs handlers", () => {
  beforeEach(() => {
    mockListWebhookLogs = async () => ({ items: [], total: 0 });
    mockDeleteWebhookLogs = async () => {};
    mockListCronLogs = async () => ({ items: [], total: 0 });
    mockDeleteCronLogs = async () => {};
  });

  describe("listWebhookLogsHandler", () => {
    test("200 with default pagination", async () => {
      expect((await listWebhookLogsHandler({})).status).toBe(200);
    });

    test("200 with all filters parsed", async () => {
      let captured: unknown;
      mockListWebhookLogs = async (input: unknown) => {
        captured = input;
        return { items: [], total: 0 };
      };
      const r = await listWebhookLogsHandler({
        projectId: "p1",
        excludeProjectIds: "a, b ,",
        excludeClientIps: "1.1.1.1,2.2.2.2",
        method: "POST",
        statusCode: "200",
        errorCode: "auth_invalid",
        success: "true",
        page: "2",
        pageSize: "9999",
      });
      expect(r.status).toBe(200);
      const c = captured as {
        projectId?: string;
        excludeProjectIds?: string[];
        excludeClientIps?: string[];
        method?: string;
        statusCode?: number;
        errorCode?: string;
        success?: boolean;
        page: number;
        pageSize: number;
      };
      expect(c.excludeProjectIds).toEqual(["a", "b"]);
      expect(c.excludeClientIps).toEqual(["1.1.1.1", "2.2.2.2"]);
      expect(c.statusCode).toBe(200);
      expect(c.success).toBe(true);
      expect(c.page).toBe(2);
      expect(c.pageSize).toBe(100);
    });

    test("success=false maps to false", async () => {
      let captured: { success?: boolean } = {};
      mockListWebhookLogs = async (input: { success?: boolean }) => {
        captured = input;
        return { items: [] };
      };
      await listWebhookLogsHandler({ success: "false" });
      expect(captured.success).toBe(false);
    });

    test("invalid statusCode falls back to undefined", async () => {
      let captured: { statusCode?: number } = {};
      mockListWebhookLogs = async (input: { statusCode?: number }) => {
        captured = input;
        return { items: [] };
      };
      await listWebhookLogsHandler({ statusCode: "junk" });
      expect(captured.statusCode).toBeUndefined();
    });

    test("500 on db error", async () => {
      mockListWebhookLogs = async () => {
        throw new Error("db");
      };
      expect((await listWebhookLogsHandler({})).status).toBe(500);
    });
  });

  describe("deleteWebhookLogsHandler", () => {
    test("200 on success", async () => {
      const r = await deleteWebhookLogsHandler({
        body: { projectId: "p1", method: "POST", success: false },
      });
      expect(r.status).toBe(200);
    });

    test("200 with empty body", async () => {
      expect(
        (await deleteWebhookLogsHandler({ body: null })).status,
      ).toBe(200);
    });

    test("500 on db error", async () => {
      mockDeleteWebhookLogs = async () => {
        throw new Error("db");
      };
      expect(
        (await deleteWebhookLogsHandler({ body: {} })).status,
      ).toBe(500);
    });
  });

  describe("listCronLogsHandler", () => {
    test("200 with defaults", async () => {
      expect((await listCronLogsHandler({})).status).toBe(200);
    });

    test("200 with valid status", async () => {
      let captured: { status?: string } = {};
      mockListCronLogs = async (input: { status?: string }) => {
        captured = input;
        return { items: [] };
      };
      await listCronLogsHandler({
        projectId: "p1",
        status: "success",
        page: "3",
        pageSize: "10",
      });
      expect(captured.status).toBe("success");
    });

    test("invalid status drops to undefined", async () => {
      let captured: { status?: string } = {};
      mockListCronLogs = async (input: { status?: string }) => {
        captured = input;
        return { items: [] };
      };
      await listCronLogsHandler({ status: "bogus" });
      expect(captured.status).toBeUndefined();
    });

    test("500 on db error", async () => {
      mockListCronLogs = async () => {
        throw new Error("db");
      };
      expect((await listCronLogsHandler({})).status).toBe(500);
    });
  });

  describe("deleteCronLogsHandler", () => {
    test("204 on success", async () => {
      const r = await deleteCronLogsHandler({});
      expect(r.status).toBe(204);
      expect(r.kind).toBe("empty");
    });

    test("204 with valid status filter", async () => {
      const r = await deleteCronLogsHandler({
        projectId: "p1",
        status: "failed",
      });
      expect(r.status).toBe(204);
    });

    test("500 on db error", async () => {
      mockDeleteCronLogs = async () => {
        throw new Error("db");
      };
      expect((await deleteCronLogsHandler({})).status).toBe(500);
    });
  });
});
