import { describe, expect, test, beforeEach, vi } from "vitest";
import {
  WEBHOOK_LOG_STUBS,
  CRON_LOG_STUBS,
  makeMockCtx,
} from "../helpers";

let mockListWebhookLogs: (...a: any[]) => Promise<any> = async () => ({
  items: [],
  total: 0,
});
let mockDeleteWebhookLogs: (...a: any[]) => Promise<void> = async () => {};
let mockListCronLogs: (...a: any[]) => Promise<any> = async () => ({
  items: [],
  total: 0,
});
let mockDeleteCronLogs: (...a: any[]) => Promise<void> = async () => {};

vi.doMock("../../lib/db/webhook-logs", () => ({
  ...WEBHOOK_LOG_STUBS,
  listWebhookLogs: (_db: unknown, ...a: unknown[]) => mockListWebhookLogs(...a),
  deleteWebhookLogs: (_db: unknown, ...a: unknown[]) =>
    mockDeleteWebhookLogs(...a),
}));

vi.doMock("../../lib/db/cron-logs", () => ({
  ...CRON_LOG_STUBS,
  listCronLogs: (_db: unknown, ...a: unknown[]) => mockListCronLogs(...a),
  deleteCronLogs: (_db: unknown, ...a: unknown[]) => mockDeleteCronLogs(...a),
}));

const {
  listWebhookLogsHandler,
  deleteWebhookLogsHandler,
  listCronLogsHandler,
  deleteCronLogsHandler,
} = await import("../../handlers/logs");

const ctx = makeMockCtx();

describe("logs handlers", () => {
  beforeEach(() => {
    mockListWebhookLogs = async () => ({ items: [], total: 0 });
    mockDeleteWebhookLogs = async () => {};
    mockListCronLogs = async () => ({ items: [], total: 0 });
    mockDeleteCronLogs = async () => {};
  });

  describe("listWebhookLogsHandler", () => {
    test("200 with default pagination", async () => {
      const r = await listWebhookLogsHandler({}, ctx);
      expect(r.status).toBe(200);
      expect(r.kind).toBe("json");
      // Pin the default-pagination body shape: handler must pass
      // the listWebhookLogs return verbatim (no envelope wrapping).
      if (r.kind === "json") expect(r.body).toEqual({ items: [], total: 0 });
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
      }, ctx);
      expect(r.status).toBe(200);
      // Tightened: pin the entire parsed-filter object instead of 5
      // individual fields. Catches drift in any param the handler
      // forwards (projectId, method, errorCode), the CSV trim/split
      // logic, and pageSize clamping (9999 → 100). A typo in any key
      // name would surface here, where toBe-on-each-key would silently
      // miss it.
      expect(captured).toEqual({
        projectId: "p1",
        excludeProjectIds: ["a", "b"],
        excludeClientIps: ["1.1.1.1", "2.2.2.2"],
        method: "POST",
        statusCode: 200,
        errorCode: "auth_invalid",
        success: true,
        page: 2,
        pageSize: 100,
      });
    });

    test("success=false maps to false", async () => {
      let captured: { success?: boolean } = {};
      mockListWebhookLogs = async (input: { success?: boolean }) => {
        captured = input;
        return { items: [] };
      };
      await listWebhookLogsHandler({ success: "false" }, ctx);
      expect(captured.success).toBe(false);
    });

    test("invalid statusCode falls back to undefined", async () => {
      let captured: { statusCode?: number } = {};
      mockListWebhookLogs = async (input: { statusCode?: number }) => {
        captured = input;
        return { items: [] };
      };
      await listWebhookLogsHandler({ statusCode: "junk" }, ctx);
      expect(captured.statusCode).toBeUndefined();
    });

    test("all-comma excludeProjectIds yields undefined (covers parts.length === 0 branch)", async () => {
      // Covers line 26 of handlers/logs.ts: the falsy branch of
      // `parts.length > 0 ? parts : undefined` in splitCsv. Input
      // ', , ,' splits/trims/filter(Boolean)s down to [], so the
      // helper must return undefined (not an empty array). Documents
      // that the DB layer never sees an empty exclude list.
      let captured: { excludeProjectIds?: string[] } = {};
      mockListWebhookLogs = async (input: {
        excludeProjectIds?: string[];
      }) => {
        captured = input;
        return { items: [] };
      };
      await listWebhookLogsHandler(
        { excludeProjectIds: ", , ," },
        ctx,
      );
      expect(captured.excludeProjectIds).toBeUndefined();
    });

    test("non-numeric page falls back to 1 and pageSize <1 clamps up to 1", async () => {
      // Covers lines 42-45 of handlers/logs.ts: the `|| 1` and
      // `Math.max(1, ...) || 50` fallbacks. parseInt('abc',10) = NaN
      // (falsy) → || 1 fires. pageSize='0' → parseInt OK 0 → falsy ||
      // 50 fires → max(1,50)=50. We use pageSize='-5' to also trigger
      // the Math.max(1, ...) clamp on a negative parsed value.
      let captured: { page?: number; pageSize?: number } = {};
      mockListWebhookLogs = async (input: {
        page?: number;
        pageSize?: number;
      }) => {
        captured = input;
        return { items: [] };
      };
      await listWebhookLogsHandler(
        { page: "not-a-number", pageSize: "-5" },
        ctx,
      );
      // page: NaN || 1 = 1
      expect(captured.page).toBe(1);
      // pageSize: parseInt(-5)=-5 (truthy) → Math.max(1, -5) = 1 → Math.min(100, 1) = 1
      expect(captured.pageSize).toBe(1);
    });

    test("500 on db error", async () => {
      mockListWebhookLogs = async () => {
        throw new Error("db");
      };
      const r = await listWebhookLogsHandler({}, ctx);
      expect(r.status).toBe(500);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        expect(r.body).toEqual({ error: "Failed to list webhook logs" });
    });
  });

  describe("deleteWebhookLogsHandler", () => {
    test("200 on success", async () => {
      const r = await deleteWebhookLogsHandler({
        body: { projectId: "p1", method: "POST", success: false },
      }, ctx);
      expect(r.status).toBe(200);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        expect(r.body).toEqual({ success: true });
    });

    test("200 with empty body", async () => {
      const r = await deleteWebhookLogsHandler({ body: null }, ctx);
      expect(r.status).toBe(200);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        expect(r.body).toEqual({ success: true });
    });

    test("500 on db error", async () => {
      mockDeleteWebhookLogs = async () => {
        throw new Error("db");
      };
      const r = await deleteWebhookLogsHandler({ body: {} }, ctx);
      expect(r.status).toBe(500);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        expect(r.body).toEqual({ error: "Failed to delete webhook logs" });
    });
  });

  describe("listCronLogsHandler", () => {
    test("200 with defaults", async () => {
      const r = await listCronLogsHandler({}, ctx);
      expect(r.status).toBe(200);
      expect(r.kind).toBe("json");
      // Tightened: handler must pass the listCronLogs return verbatim
      // (no envelope wrapping).
      if (r.kind === "json")
        expect(r.body).toEqual({ items: [], total: 0 });
    });

    test("200 with valid status", async () => {
      let captured: unknown;
      mockListCronLogs = async (input: unknown) => {
        captured = input;
        return { items: [] };
      };
      await listCronLogsHandler({
        projectId: "p1",
        status: "success",
        page: "3",
        pageSize: "10",
      }, ctx);
      // Tightened: pin the entire parsed-filter object instead of just
      // status. Catches projectId / page / pageSize forwarding drift.
      expect(captured).toEqual({
        projectId: "p1",
        status: "success",
        page: 3,
        pageSize: 10,
      });
    });

    test("invalid status drops to undefined", async () => {
      let captured: { status?: string } = {};
      mockListCronLogs = async (input: { status?: string }) => {
        captured = input;
        return { items: [] };
      };
      await listCronLogsHandler({ status: "bogus" }, ctx);
      expect(captured.status).toBeUndefined();
    });

    test("500 on db error", async () => {
      mockListCronLogs = async () => {
        throw new Error("db");
      };
      const r = await listCronLogsHandler({}, ctx);
      expect(r.status).toBe(500);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        expect(r.body).toEqual({ error: "Failed to list cron logs" });
    });
  });

  describe("deleteCronLogsHandler", () => {
    test("204 on success", async () => {
      const r = await deleteCronLogsHandler({}, ctx);
      expect(r.status).toBe(204);
      expect(r.kind).toBe("empty");
    });

    test("204 with valid status filter", async () => {
      const r = await deleteCronLogsHandler({
        projectId: "p1",
        status: "failed",
      }, ctx);
      expect(r.status).toBe(204);
      expect(r.kind).toBe("empty");
    });

    test("500 on db error", async () => {
      mockDeleteCronLogs = async () => {
        throw new Error("db");
      };
      const r = await deleteCronLogsHandler({}, ctx);
      expect(r.status).toBe(500);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        expect(r.body).toEqual({ error: "Failed to delete cron logs" });
    });
  });
});
