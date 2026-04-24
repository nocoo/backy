import { describe, expect, test } from "bun:test";
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
  });

  test("200 on success", async () => {
    const fetcher = async () =>
      new Response(JSON.stringify({ ip: "1.2.3.4", country: "US" }), {
        status: 200,
      });
    const r = await ipInfoHandler({ ip: "1.2.3.4" }, ctx, fetcher);
    expect(r.status).toBe(200);
  });

  test("502 on upstream error", async () => {
    const fetcher = async () =>
      new Response("bad", { status: 500, statusText: "Server Error" });
    const r = await ipInfoHandler({ ip: "1.2.3.4" }, ctx, fetcher);
    expect(r.status).toBe(502);
  });

  test("500 on fetcher throw", async () => {
    const fetcher = async () => {
      throw new Error("net");
    };
    const r = await ipInfoHandler({ ip: "1.2.3.4" }, ctx, fetcher);
    expect(r.status).toBe(500);
  });

  test("uses default fetcher when not provided", async () => {
    const originalFetch = globalThis.fetch;
    // @ts-expect-error narrow override for the test
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 });
    try {
      const r = await ipInfoHandler({ ip: "1.2.3.4" }, ctx);
      expect(r.status).toBe(200);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
