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

    test("throws on HTTP error", async () => {
      const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

      globalThis.fetch = mockFetch(async () =>
        new Response("Internal Server Error", { status: 500 }),
      );

      await expect(executeD1Query("SELECT 1")).rejects.toThrow("D1 query failed");
      consoleSpy.mockRestore();
    });

    test("throws on D1 API error response", async () => {
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

    test("throws UNIQUE constraint error when D1 reports unique violation", async () => {
      const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

      globalThis.fetch = mockFetch(async () =>
        new Response(
          JSON.stringify({
            success: false,
            result: [],
            errors: [{ message: "UNIQUE constraint failed: projects.name" }],
          }),
          { status: 200 },
        ),
      );

      await expect(executeD1Query("INSERT INTO projects ...")).rejects.toThrow("UNIQUE constraint failed");
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
