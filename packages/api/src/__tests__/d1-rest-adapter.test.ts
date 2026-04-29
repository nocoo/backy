/**
 * Direct unit tests for the D1 REST adapter (legacy Next.js host path).
 *
 * The adapter is only used in production via the legacy Next.js worker
 * boundary; the new Hono worker uses the binding adapter (covered by
 * d1-binding-adapter.test.ts). Without these tests the rest adapter
 * sat at 40% statement coverage with the entire retry + error matrix
 * unexercised.
 *
 * Tests inject a stub `fetch` and a no-op `sleep` so the retry path
 * runs synchronously.
 */
import { beforeEach, describe, expect, test } from "vitest";
import {
  createRestD1Adapter,
  isRestD1Configured,
} from "@backy/api/db/d1-rest-adapter";
import type { BackyEnv } from "@backy/api/runtime";

const baseEnv: Pick<BackyEnv, "D1_ACCOUNT_ID" | "D1_DATABASE_ID" | "D1_API_TOKEN"> = {
  D1_ACCOUNT_ID: "acc-1",
  D1_DATABASE_ID: "db-1",
  D1_API_TOKEN: "tok-1",
};

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

function makeFetchStub(
  responses: Array<Response | (() => Response | Promise<Response>)>,
) {
  const calls: FetchCall[] = [];
  let i = 0;
  const fn = ((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const next = responses[i++];
    if (next === undefined) {
      throw new Error(`fetch stub exhausted after ${calls.length} call(s)`);
    }
    if (typeof next === "function") return Promise.resolve(next());
    return Promise.resolve(next);
  }) as unknown as typeof globalThis.fetch;
  // Bun's typeof fetch requires a `preconnect` shape on the function.
  (fn as unknown as { preconnect: () => void }).preconnect = () => {};
  return { fn, calls };
}

const noSleep = async () => {};

describe("isRestD1Configured", () => {
  test("returns true when all three creds are present", () => {
    expect(isRestD1Configured(baseEnv as BackyEnv)).toBe(true);
  });

  test("returns false when any cred is missing or empty", () => {
    expect(
      isRestD1Configured({ ...baseEnv, D1_ACCOUNT_ID: "" } as BackyEnv),
    ).toBe(false);
    expect(
      isRestD1Configured({ ...baseEnv, D1_DATABASE_ID: "" } as BackyEnv),
    ).toBe(false);
    expect(
      isRestD1Configured({ ...baseEnv, D1_API_TOKEN: "" } as BackyEnv),
    ).toBe(false);
  });
});

describe("createRestD1Adapter", () => {
  let captured: FetchCall[];

  beforeEach(() => {
    captured = [];
  });

  test("throws 'D1 credentials not configured' when any cred missing", async () => {
    const { fn } = makeFetchStub([]);
    const adapter = createRestD1Adapter(
      { ...baseEnv, D1_API_TOKEN: "" } as typeof baseEnv,
      { fetch: fn, sleep: noSleep },
    );
    await expect(adapter.query("SELECT 1")).rejects.toThrow(
      "D1 credentials not configured",
    );
  });

  test("happy path: posts to v4 URL with bearer + JSON body and returns rows+meta", async () => {
    const { fn, calls } = makeFetchStub([
      new Response(
        JSON.stringify({
          success: true,
          result: [
            {
              results: [{ id: 1 }],
              success: true,
              meta: { duration: 0.5, changes: 0 },
            },
          ],
          errors: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ]);
    const adapter = createRestD1Adapter(baseEnv, { fetch: fn, sleep: noSleep });

    const result = await adapter.query<{ id: number }>("SELECT ?", [1]);
    captured = calls;

    expect(result.results).toEqual([{ id: 1 }]);
    expect(result.meta).toEqual({ duration: 0.5, changes: 0 });
    expect(captured).toHaveLength(1);
    const call = captured[0]!;
    expect(call.url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acc-1/d1/database/db-1/query",
    );
    expect(call.init?.method).toBe("POST");
    const headers = call.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok-1");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(call.init?.body).toBe(JSON.stringify({ sql: "SELECT ?", params: [1] }));
  });

  test("respects baseUrl override (covers ?? branch)", async () => {
    const { fn, calls } = makeFetchStub([
      new Response(
        JSON.stringify({
          success: true,
          result: [{ results: [], success: true, meta: undefined }],
          errors: [],
        }),
        { status: 200 },
      ),
    ]);
    const adapter = createRestD1Adapter(baseEnv, {
      fetch: fn,
      sleep: noSleep,
      baseUrl: "https://example.test/api",
    });
    await adapter.query("SELECT 1");
    expect(calls[0]!.url).toBe(
      "https://example.test/api/accounts/acc-1/d1/database/db-1/query",
    );
  });

  test("default empty params still serializes params=[]", async () => {
    const { fn, calls } = makeFetchStub([
      new Response(
        JSON.stringify({
          success: true,
          result: [{ results: [], success: true, meta: undefined }],
          errors: [],
        }),
        { status: 200 },
      ),
    ]);
    const adapter = createRestD1Adapter(baseEnv, { fetch: fn, sleep: noSleep });
    await adapter.query("SELECT 1");
    expect(calls[0]!.init?.body).toBe(
      JSON.stringify({ sql: "SELECT 1", params: [] }),
    );
  });

  test("missing meta in response still resolves with empty results", async () => {
    const { fn } = makeFetchStub([
      new Response(
        JSON.stringify({
          success: true,
          result: [{ results: undefined, success: true, meta: undefined }],
          errors: [],
        }),
        { status: 200 },
      ),
    ]);
    const adapter = createRestD1Adapter(baseEnv, { fetch: fn, sleep: noSleep });
    const r = await adapter.query("SELECT 1");
    expect(r.results).toEqual([]);
    expect(r.meta).toBeUndefined();
  });

  test("retries on HTTP 5xx then succeeds (covers transient-status retry)", async () => {
    const { fn, calls } = makeFetchStub([
      new Response("upstream 503", { status: 503 }),
      new Response(
        JSON.stringify({
          success: true,
          result: [{ results: [{ x: 1 }], success: true, meta: undefined }],
          errors: [],
        }),
        { status: 200 },
      ),
    ]);
    const adapter = createRestD1Adapter(baseEnv, { fetch: fn, sleep: noSleep });
    const r = await adapter.query<{ x: number }>("SELECT 1");
    expect(r.results).toEqual([{ x: 1 }]);
    expect(calls).toHaveLength(2);
  });

  test("retries on body containing '7429' timeout marker then succeeds", async () => {
    const { fn, calls } = makeFetchStub([
      new Response("D1 error 7429: throttled", { status: 400 }),
      new Response(
        JSON.stringify({
          success: true,
          result: [{ results: [], success: true, meta: undefined }],
          errors: [],
        }),
        { status: 200 },
      ),
    ]);
    const adapter = createRestD1Adapter(baseEnv, { fetch: fn, sleep: noSleep });
    await adapter.query("SELECT 1");
    expect(calls).toHaveLength(2);
  });

  test("non-transient 4xx error fails immediately without retry", async () => {
    const { fn, calls } = makeFetchStub([
      new Response("permanent 400 (not transient)", { status: 400 }),
    ]);
    const adapter = createRestD1Adapter(baseEnv, { fetch: fn, sleep: noSleep });
    await expect(adapter.query("SELECT 1")).rejects.toThrow("D1 query failed");
    expect(calls).toHaveLength(1);
  });

  test("payload-level success=false with UNIQUE detail throws 'UNIQUE constraint failed'", async () => {
    const { fn } = makeFetchStub([
      new Response(
        JSON.stringify({
          success: false,
          result: [],
          errors: [{ message: "UNIQUE constraint failed: projects.name" }],
        }),
        { status: 200 },
      ),
    ]);
    const adapter = createRestD1Adapter(baseEnv, { fetch: fn, sleep: noSleep });
    await expect(adapter.query("INSERT ...")).rejects.toThrow(
      "UNIQUE constraint failed",
    );
  });

  test("payload-level success=false with non-unique detail throws 'D1 query failed'", async () => {
    const { fn } = makeFetchStub([
      new Response(
        JSON.stringify({
          success: false,
          result: [],
          errors: [{ message: "syntax error near token" }],
        }),
        { status: 200 },
      ),
    ]);
    const adapter = createRestD1Adapter(baseEnv, { fetch: fn, sleep: noSleep });
    await expect(adapter.query("BAD SQL")).rejects.toThrow("D1 query failed");
  });

  test("payload-level success=false with 'exceeded timeout' detail retries then succeeds", async () => {
    const { fn, calls } = makeFetchStub([
      new Response(
        JSON.stringify({
          success: false,
          result: [],
          errors: [{ message: "operation exceeded timeout" }],
        }),
        { status: 200 },
      ),
      new Response(
        JSON.stringify({
          success: true,
          result: [{ results: [], success: true, meta: undefined }],
          errors: [],
        }),
        { status: 200 },
      ),
    ]);
    const adapter = createRestD1Adapter(baseEnv, { fetch: fn, sleep: noSleep });
    await adapter.query("SELECT 1");
    expect(calls).toHaveLength(2);
  });

  test("HTTP 503 every attempt: exhausts D1_MAX_RETRIES and throws", async () => {
    const { fn, calls } = makeFetchStub(
      Array.from(
        { length: 4 },
        () => new Response("503 always", { status: 503 }),
      ),
    );
    const adapter = createRestD1Adapter(baseEnv, { fetch: fn, sleep: noSleep });
    await expect(adapter.query("SELECT 1")).rejects.toThrow("D1 query failed");
    // initial + 3 retries = 4 fetch calls
    expect(calls).toHaveLength(4);
  });
});
