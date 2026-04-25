import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import { ApiError, apiFetch, apiJson, swrFetcher } from "../lib/api";

const realFetch = globalThis.fetch;

function stubFetch(responder: (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(responder) as unknown as typeof fetch;
  (fn as typeof fetch & { preconnect: () => void }).preconnect = () => {};
  globalThis.fetch = fn;
  return fn as unknown as ReturnType<typeof vi.fn>;
}

beforeEach(() => {
  globalThis.fetch = realFetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("apiFetch", () => {
  test("forwards credentials: include and returns Response on 2xx", async () => {
    const fn = stubFetch((_url, init) => {
      expect(init?.credentials).toBe("include");
      return new Response("ok", { status: 200 });
    });
    const res = await apiFetch("/api/x");
    expect(res.status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("throws ApiError with json body on non-2xx", async () => {
    stubFetch(
      () =>
        new Response(JSON.stringify({ error: "nope" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    );
    try {
      await apiFetch("/api/x");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      const err = e as ApiError;
      expect(err.status).toBe(400);
      expect(err.body).toEqual({ error: "nope" });
    }
  });

  test("ApiError falls back to text body when not json", async () => {
    stubFetch(() => new Response("plain", { status: 500 }));
    try {
      await apiFetch("/api/x");
    } catch (e) {
      const err = e as ApiError;
      expect(err.body).toBe("plain");
    }
  });

  test("ApiError tolerates body parse failure", async () => {
    stubFetch(
      () =>
        new Response("{not json", {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
    );
    try {
      await apiFetch("/api/x");
    } catch (e) {
      const err = e as ApiError;
      expect(err.body).toBeNull();
    }
  });
});

describe("apiJson + swrFetcher", () => {
  test("apiJson parses 2xx body", async () => {
    stubFetch(
      () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const out = await apiJson<{ ok: boolean }>("/api/x");
    expect(out).toEqual({ ok: true });
  });

  test("swrFetcher delegates to apiJson", async () => {
    stubFetch(() =>
      new Response(JSON.stringify({ a: 1 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const out = await swrFetcher<{ a: number }>("/api/y");
    expect(out).toEqual({ a: 1 });
  });
});
