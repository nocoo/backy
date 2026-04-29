import { describe, expect, test } from "vitest";
import { makeMockCtx } from "../helpers";
import { ipInfoHandler } from "../../handlers/ip-info";

const ctx = makeMockCtx();

describe("ipInfoHandler", () => {
  test("400 when ip missing", async () => {
    const r = await ipInfoHandler(
      { ip: null },
      ctx,
      async () => new Response(),
    );
    expect(r.status).toBe(400);
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      expect(r.body).toEqual({ error: "Missing ip parameter" });
  });

  test("503 when ECHO_API_URL not configured (preempts 400 missing-ip)", async () => {
    // Discovery: the no-config 503 check runs BEFORE the missing-ip 400
    // check. So even with `ip: null` (which would normally yield 400),
    // an unconfigured handler returns 503. This documents the precedence:
    // service-unavailable beats validation errors. Catches a refactor
    // that flips the order and ends up validating ip= for an inert
    // service.
    // Build a context manually to clear ECHO_API_URL (Partial<BackyEnv>
    // with exactOptionalPropertyTypes:true forbids `undefined` for an
    // optional string field).
    const baseCtx = makeMockCtx();
    const noEchoCtx: typeof baseCtx = {
      ...baseCtx,
      env: { ...baseCtx.env, ECHO_API_URL: "" },
    };
    const r = await ipInfoHandler(
      { ip: null },
      noEchoCtx,
      async () => new Response(),
    );
    expect(r.status).toBe(503);
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      expect(r.body).toEqual({ error: "IP info service not configured" });
  });

  test("200 on success", async () => {
    const fetcher = async () =>
      new Response(JSON.stringify({ ip: "1.2.3.4", country: "US" }), {
        status: 200,
      });
    const r = await ipInfoHandler({ ip: "1.2.3.4" }, ctx, fetcher);
    expect(r.status).toBe(200);
    // Tightened: handler must pass upstream JSON through verbatim.
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      expect(r.body).toEqual({ ip: "1.2.3.4", country: "US" });
  });

  test("502 on upstream error", async () => {
    const fetcher = async () =>
      new Response("bad", { status: 500, statusText: "Server Error" });
    const r = await ipInfoHandler({ ip: "1.2.3.4" }, ctx, fetcher);
    expect(r.status).toBe(502);
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      expect(r.body).toEqual({ error: "IP info service unavailable" });
  });

  test("500 on fetcher throw", async () => {
    const fetcher = async () => {
      throw new Error("net");
    };
    const r = await ipInfoHandler({ ip: "1.2.3.4" }, ctx, fetcher);
    expect(r.status).toBe(500);
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      expect(r.body).toEqual({ error: "Failed to fetch IP info" });
  });

  test("uses default fetcher when not provided", async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl: string | undefined;
    let capturedHeaders: Record<string, string> | undefined;
    // @ts-expect-error narrow override for the test
    globalThis.fetch = async (url, init) => {
      capturedUrl = typeof url === "string" ? url : url.toString();
      capturedHeaders = (init?.headers ?? undefined) as
        | Record<string, string>
        | undefined;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    try {
      const r = await ipInfoHandler({ ip: "1.2.3.4" }, ctx);
      expect(r.status).toBe(200);
      expect(r.kind).toBe("json");
      // Tightened: pin response body pass-through AND outbound URL
      // (with ?ip= query) AND x-api-key header forwarding. The
      // default-fetcher path (no fetcher arg) must behave identically
      // to the explicit-fetcher path.
      if (r.kind === "json") expect(r.body).toEqual({ ok: true });
      expect(capturedUrl).toBe(
        "https://echo.example.com?ip=1.2.3.4",
      );
      expect(capturedHeaders?.["x-api-key"]).toBe("test-echo-key");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("forwards empty x-api-key header when ECHO_API_KEY is unset (covers ?? '' fallback)", async () => {
    // Covers the falsy branch of `ctx.env.ECHO_API_KEY ?? ''` on line
    // 17 of handlers/ip-info.ts. The default makeMockCtx sets
    // ECHO_API_KEY='test-echo-key', so the existing tests only
    // exercise the truthy branch. This test clears ECHO_API_KEY and
    // verifies the handler still proceeds with an empty x-api-key
    // (echoKey → '' fallback).
    const baseCtx = makeMockCtx();
    const noKeyCtx: typeof baseCtx = {
      ...baseCtx,
      env: { ...baseCtx.env, ECHO_API_KEY: "" },
    };
    let capturedHeaders: Record<string, string> | undefined;
    const fetcher = async (
      _url: string,
      init: { headers: Record<string, string> },
    ) => {
      capturedHeaders = init.headers;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    const r = await ipInfoHandler({ ip: "1.2.3.4" }, noKeyCtx, fetcher);
    expect(r.status).toBe(200);
    expect(capturedHeaders?.["x-api-key"]).toBe("");
  });
});
