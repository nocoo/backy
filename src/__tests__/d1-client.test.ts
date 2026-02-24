import { describe, expect, test, beforeEach, afterEach, spyOn } from "bun:test";
import { isD1Configured, executeD1Query } from "@/lib/db/d1-client";

/** Create a mock fetch that satisfies Bun's typeof fetch (includes preconnect). */
function mockFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): typeof globalThis.fetch {
  const fn = handler as typeof globalThis.fetch;
  fn.preconnect = () => {};
  return fn;
}

describe("D1 client", () => {
  test("isD1Configured returns true when env vars are set", () => {
    expect(isD1Configured()).toBe(true);
  });

  describe("executeD1Query", () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    test("sends correct request to Cloudflare D1 API", async () => {
      let capturedUrl = "";
      let capturedInit: RequestInit | undefined;

      globalThis.fetch = mockFetch(async (input, init) => {
        capturedUrl = input as string;
        capturedInit = init;
        return new Response(
          JSON.stringify({
            success: true,
            result: [{ results: [{ id: "1", name: "test" }], success: true, meta: { changes: 0, last_row_id: 0 } }],
            errors: [],
          }),
          { status: 200 },
        );
      });

      await executeD1Query("SELECT * FROM projects WHERE id = ?", ["proj-1"]);

      expect(capturedUrl).toContain("api.cloudflare.com");
      expect(capturedUrl).toContain("/d1/database/");
      expect(capturedUrl).toContain("/query");
      expect(capturedInit?.method).toBe("POST");

      const body = JSON.parse(capturedInit?.body as string);
      expect(body.sql).toBe("SELECT * FROM projects WHERE id = ?");
      expect(body.params).toEqual(["proj-1"]);
    });

    test("returns results on success", async () => {
      const mockData = [
        { id: "1", name: "Project A" },
        { id: "2", name: "Project B" },
      ];

      globalThis.fetch = mockFetch(async () =>
        new Response(
          JSON.stringify({
            success: true,
            result: [{ results: mockData, success: true, meta: { changes: 0, last_row_id: 0 } }],
            errors: [],
          }),
          { status: 200 },
        ),
      );

      const results = await executeD1Query<{ id: string; name: string }>("SELECT * FROM projects");
      expect(results).toEqual(mockData);
    });

    test("returns empty array when result has no results property", async () => {
      globalThis.fetch = mockFetch(async () =>
        new Response(
          JSON.stringify({
            success: true,
            result: [{ success: true, meta: { changes: 0, last_row_id: 0 } }],
            errors: [],
          }),
          { status: 200 },
        ),
      );

      const results = await executeD1Query("DELETE FROM projects WHERE id = ?", ["proj-1"]);
      expect(results).toEqual([]);
    });

    test("throws on HTTP error after retrying transient 5xx", async () => {
      let callCount = 0;
      const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

      globalThis.fetch = mockFetch(async () => {
        callCount++;
        return new Response("Internal Server Error", { status: 500 });
      });

      await expect(executeD1Query("SELECT 1")).rejects.toThrow("D1 query failed");
      // 1 initial + 3 retries = 4 total
      expect(callCount).toBe(4);
      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });

    test("retries on transient D1 timeout and succeeds", async () => {
      let callCount = 0;
      const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

      const successBody = JSON.stringify({
        success: true,
        result: [{ results: [{ id: "1" }], success: true, meta: { changes: 1, last_row_id: 1 } }],
        errors: [],
      });

      globalThis.fetch = mockFetch(async () => {
        callCount++;
        if (callCount <= 2) {
          // First two calls: D1 timeout (code 7429)
          return new Response(
            JSON.stringify({
              errors: [{ code: 7429, message: "D1 DB storage operation exceeded timeout which caused object to be reset." }],
              success: false,
              messages: [],
              result: null,
            }),
            { status: 500 },
          );
        }
        return new Response(successBody, { status: 200 });
      });

      const results = await executeD1Query<{ id: string }>("INSERT INTO backups ...");
      expect(results).toEqual([{ id: "1" }]);
      expect(callCount).toBe(3);
      warnSpy.mockRestore();
    });

    test("does not retry non-transient HTTP errors (e.g. 400)", async () => {
      let callCount = 0;
      const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

      globalThis.fetch = mockFetch(async () => {
        callCount++;
        return new Response("Bad Request", { status: 400 });
      });

      await expect(executeD1Query("SELECT 1")).rejects.toThrow("D1 query failed");
      expect(callCount).toBe(1);
      consoleSpy.mockRestore();
    });

    test("throws on D1 API error response (non-transient)", async () => {
      const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

      globalThis.fetch = mockFetch(async () =>
        new Response(
          JSON.stringify({
            success: false,
            result: [],
            errors: [{ message: "syntax error near ..." }],
          }),
          { status: 200 },
        ),
      );

      await expect(executeD1Query("INVALID SQL")).rejects.toThrow("D1 query failed");
      consoleSpy.mockRestore();
    });

    test("retries on transient API-level error (timeout in response body)", async () => {
      let callCount = 0;
      const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

      const successBody = JSON.stringify({
        success: true,
        result: [{ results: [], success: true, meta: { changes: 1, last_row_id: 1 } }],
        errors: [],
      });

      globalThis.fetch = mockFetch(async () => {
        callCount++;
        if (callCount === 1) {
          return new Response(
            JSON.stringify({
              success: false,
              result: [],
              errors: [{ message: "D1 DB storage operation exceeded timeout" }],
            }),
            { status: 200 },
          );
        }
        return new Response(successBody, { status: 200 });
      });

      const results = await executeD1Query("INSERT INTO backups ...");
      expect(results).toEqual([]);
      expect(callCount).toBe(2);
      warnSpy.mockRestore();
    });

    test("throws UNIQUE constraint error without retrying", async () => {
      let callCount = 0;
      const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

      globalThis.fetch = mockFetch(async () => {
        callCount++;
        return new Response(
          JSON.stringify({
            success: false,
            result: [],
            errors: [{ message: "UNIQUE constraint failed: projects.name" }],
          }),
          { status: 200 },
        );
      });

      await expect(executeD1Query("INSERT INTO projects ...")).rejects.toThrow("UNIQUE constraint failed");
      expect(callCount).toBe(1);
      consoleSpy.mockRestore();
    });

    test("throws when D1 credentials are not configured", async () => {
      const origAccountId = process.env.D1_ACCOUNT_ID;
      const origDatabaseId = process.env.D1_DATABASE_ID;
      const origToken = process.env.D1_API_TOKEN;

      delete process.env.D1_ACCOUNT_ID;
      delete process.env.D1_DATABASE_ID;
      delete process.env.D1_API_TOKEN;

      try {
        await expect(executeD1Query("SELECT 1")).rejects.toThrow("D1 credentials not configured");
      } finally {
        process.env.D1_ACCOUNT_ID = origAccountId;
        process.env.D1_DATABASE_ID = origDatabaseId;
        process.env.D1_API_TOKEN = origToken;
      }
    });

    test("defaults params to empty array", async () => {
      let capturedBody = "";

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBody = init?.body as string;
        return new Response(
          JSON.stringify({
            success: true,
            result: [{ results: [], success: true, meta: { changes: 0, last_row_id: 0 } }],
            errors: [],
          }),
          { status: 200 },
        );
      });

      await executeD1Query("SELECT 1");
      const body = JSON.parse(capturedBody);
      expect(body.params).toEqual([]);
    });
  });
});
