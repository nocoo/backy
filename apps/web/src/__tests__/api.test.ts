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
    await expect(apiFetch("/api/x")).rejects.toBeInstanceOf(ApiError);
    await expect(apiFetch("/api/x")).rejects.toMatchObject({
      status: 400,
      body: { error: "nope" },
    });
  });

  test("ApiError falls back to text body when not json", async () => {
    stubFetch(() => new Response("plain", { status: 500 }));
    // Use rejects.* so the test fails if apiFetch resolves instead of
    // throwing (the prior try/catch silently passed in that case).
    await expect(apiFetch("/api/x")).rejects.toMatchObject({
      status: 500,
      body: "plain",
    });
  });

  test("ApiError tolerates body parse failure", async () => {
    stubFetch(
      () =>
        new Response("{not json", {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
    );
    await expect(apiFetch("/api/x")).rejects.toMatchObject({
      status: 500,
      body: null,
    });
  });

  test("ApiError returns null when res.text() rejects (covers safeBody text catch branch)", async () => {
    // Covers the catch branch in safeBody (api.ts:54) where res.text()
    // throws — e.g. a body stream error. The json path isn't taken
    // because content-type has no "application/json", so safeBody falls
    // through to res.text() which rejects.
    stubFetch(() => {
      const res = new Response("x", { status: 502 });
      res.text = () => Promise.reject(new Error("body stream consumed"));
      return res;
    });
    await expect(apiFetch("/api/x")).rejects.toMatchObject({
      status: 502,
      body: null,
    });
  });

  test("safeBody uses fallback when content-type header is null (covers ?? branch)", async () => {
    // Covers the nullish branch of `res.headers.get("content-type") ?? ""`
    // in safeBody (api.ts:43). All other tests create Response objects
    // that auto-set Content-Type (e.g. new Response("text") → text/plain).
    // Here we strip the header so get() returns null → ?? fires.
    stubFetch(() => {
      const res = new Response("no-ct", { status: 503 });
      res.headers.delete("content-type");
      return res;
    });
    await expect(apiFetch("/api/x")).rejects.toMatchObject({
      status: 503,
      body: "no-ct",
    });
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
