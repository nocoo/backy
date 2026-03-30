import { describe, expect, test, beforeEach, afterEach, spyOn } from "bun:test";
import { mockFetch, d1Success } from "./helpers";
import { NextRequest } from "next/server";

describe("/api/cron/logs", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // --- Helpers ---

  function makeRequest(path: string, init?: RequestInit) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new NextRequest(new URL(path, "http://localhost:7017"), init as any);
  }

  // -----------------------------------------------------------------------
  // GET
  // -----------------------------------------------------------------------

  describe("GET", () => {
    test("returns paginated cron logs", async () => {
      let callCount = 0;
      globalThis.fetch = mockFetch(async () => {
        callCount++;
        if (callCount === 1) return d1Success([{ count: 1 }]);
        return d1Success([{ id: "clog-1", project_id: "p1", status: "success" }]);
      });

      const { GET } = await import("@/app/api/cron/logs/route");
      const res = await GET(makeRequest("/api/cron/logs"));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.items).toHaveLength(1);
      expect(body.total).toBe(1);
    });

    test("passes filter params to D1 query", async () => {
      const capturedBodies: string[] = [];
      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBodies.push(init?.body as string);
        return d1Success(capturedBodies.length === 1 ? [{ count: 0 }] : []);
      });

      const { GET } = await import("@/app/api/cron/logs/route");
      await GET(makeRequest("/api/cron/logs?projectId=p1&status=failed&page=2&pageSize=25"));

      const countBody = JSON.parse(capturedBodies[0]!);
      expect(countBody.sql).toContain("c.project_id = ?");
      expect(countBody.params).toContain("p1");
      expect(countBody.sql).toContain("c.status = ?");
      expect(countBody.params).toContain("failed");

      const selectBody = JSON.parse(capturedBodies[1]!);
      expect(selectBody.params).toContain(25); // LIMIT = pageSize
      expect(selectBody.params).toContain(25); // OFFSET = (2-1)*25
    });

    test("ignores invalid status", async () => {
      const capturedBodies: string[] = [];
      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBodies.push(init?.body as string);
        return d1Success(capturedBodies.length === 1 ? [{ count: 0 }] : []);
      });

      const { GET } = await import("@/app/api/cron/logs/route");
      await GET(makeRequest("/api/cron/logs?status=invalid"));

      const countBody = JSON.parse(capturedBodies[0]!);
      expect(countBody.sql).not.toContain("c.status = ?");
    });

    test("clamps pageSize to 100", async () => {
      const capturedBodies: string[] = [];
      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBodies.push(init?.body as string);
        return d1Success(capturedBodies.length === 1 ? [{ count: 0 }] : []);
      });

      const { GET } = await import("@/app/api/cron/logs/route");
      await GET(makeRequest("/api/cron/logs?pageSize=999"));

      const selectBody = JSON.parse(capturedBodies[1]!);
      expect(selectBody.params).toContain(100); // LIMIT clamped
    });

    test("returns 500 on error", async () => {
      const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

      globalThis.fetch = mockFetch(async () =>
        new Response("Internal Server Error", { status: 500 }),
      );

      const { GET } = await import("@/app/api/cron/logs/route");
      const res = await GET(makeRequest("/api/cron/logs"));
      expect(res.status).toBe(500);

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // DELETE
  // -----------------------------------------------------------------------

  describe("DELETE", () => {
    test("deletes cron logs with filters", async () => {
      let capturedBody = "";
      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBody = init?.body as string;
        return d1Success();
      });

      const { DELETE } = await import("@/app/api/cron/logs/route");
      const res = await DELETE(makeRequest("/api/cron/logs?projectId=p1&status=failed"));

      expect(res.status).toBe(204);
      const body = JSON.parse(capturedBody);
      expect(body.sql).toContain("DELETE FROM cron_logs");
      expect(body.sql).toContain("project_id = ?");
      expect(body.params).toContain("p1");
      expect(body.sql).toContain("status = ?");
      expect(body.params).toContain("failed");
    });

    test("deletes all logs when no filters", async () => {
      let capturedBody = "";
      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBody = init?.body as string;
        return d1Success();
      });

      const { DELETE } = await import("@/app/api/cron/logs/route");
      const res = await DELETE(makeRequest("/api/cron/logs"));

      expect(res.status).toBe(204);
      const body = JSON.parse(capturedBody);
      expect(body.sql).toContain("DELETE FROM cron_logs");
      expect(body.params).toEqual([]);
    });

    test("returns 500 on error", async () => {
      const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

      globalThis.fetch = mockFetch(async () =>
        new Response("Internal Server Error", { status: 500 }),
      );

      const { DELETE } = await import("@/app/api/cron/logs/route");
      const res = await DELETE(makeRequest("/api/cron/logs"));
      expect(res.status).toBe(500);

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });
});
