import { beforeEach, describe, expect, test } from "vitest";
import { makeMockCtx, makeMockD1, makeMockR2, makeMockInfo } from "../helpers";
import { liveCheckHandler } from "../../handlers/live";

describe("live handler", () => {
  let db: ReturnType<typeof makeMockD1>;
  let r2: ReturnType<typeof makeMockR2>;

  beforeEach(() => {
    db = makeMockD1(async () => ({ results: [{ ok: 1 }] }));
    r2 = makeMockR2();
  });

  test("returns 200 when both up", async () => {
    const r = await liveCheckHandler(makeMockCtx({ db, r2 }));
    expect(r.status).toBe(200);
    // Tightened: pin the body shape, allowing only timestamp +
    // dependency latency_ms to be flexible (timing-dependent). Catches
    // a regression that drops version/uptime_s or relabels status.
    expect(r.kind).toBe("json");
    expect((r as { body: unknown }).body).toEqual({
      status: "ok",
      version: expect.any(String),
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      uptime_s: expect.any(Number),
      dependencies: {
        d1: { status: "up", latency_ms: expect.any(Number) },
        r2: { status: "up", latency_ms: expect.any(Number) },
      },
    });
  });

  test("returns 503 when D1 throws", async () => {
    db = makeMockD1(async () => {
      throw new Error("db down");
    });

    const r = await liveCheckHandler(makeMockCtx({ db, r2 }));
    expect(r.status).toBe(503);
    // Tightened: status='error' AND d1.status='down' AND r2.status='up'.
    // Catches a regression that flips r2 to down too on a d1-only failure.
    expect(r.kind).toBe("json");
    expect((r as { body: { status: string; dependencies: { d1: { status: string }; r2: { status: string } } } }).body).toMatchObject({
      status: "error",
      dependencies: {
        d1: { status: "down" },
        r2: { status: "up" },
      },
    });
  });

  test("returns 503 when R2 throws", async () => {
    r2 = makeMockR2({
      ping: async () => {
        throw new Error("r2 down");
      },
    });

    const r = await liveCheckHandler(makeMockCtx({ db, r2 }));
    expect(r.status).toBe(503);
  });

  test("sanitizes 'ok' from error messages", async () => {
    db = makeMockD1(async () => {
      throw new Error("not ok message");
    });

    const r = await liveCheckHandler(makeMockCtx({ db, r2 }));
    const body = r as {
      body: { dependencies: { d1: { message?: string } } };
    };
    // Tightened: pin the exact sanitized message. sanitizeMessage()
    // replaces every word-boundaried 'ok'/'OK' with '***', so 'not ok
    // message' → 'not *** message'. A regression that drops the gi
    // flag, replaces with a different mask, or skips the word-boundary
    // would surface here.
    expect(body.body.dependencies.d1.message).toBe("not *** message");
  });

  test("non-Error throw uses default message", async () => {
    db = makeMockD1(async () => {
      throw "raw"; // string — not an Error instance
    });

    const r = await liveCheckHandler(makeMockCtx({ db, r2 }));
    expect(r.status).toBe(503);
    // Tightened: pin that the d1.message default fires ("D1 unreachable")
    // when the thrown value isn't an Error instance. Status alone could
    // pass even if the handler crashed on the non-Error throw.
    expect(r.kind).toBe("json");
    if (r.kind === "json") {
      const body = r.body as { dependencies: { d1: { message: string } } };
      expect(body.dependencies.d1.message).toBe("D1 unreachable");
    }
  });

  test("non-Error R2 throw uses default 'R2 unreachable' message (covers ternary falsy branch)", async () => {
    // Symmetric to the D1 non-Error test; covers line 50 of
    // handlers/live.ts (the `: 'R2 unreachable'` fallback when the
    // thrown value isn't an Error instance).
    r2 = makeMockR2({
      ping: async () => {
        throw "raw"; // string — not an Error instance
      },
    });
    const r = await liveCheckHandler(makeMockCtx({ db, r2 }));
    expect(r.status).toBe(503);
    expect(r.kind).toBe("json");
    if (r.kind === "json") {
      const body = r.body as { dependencies: { r2: { message: string } } };
      expect(body.dependencies.r2.message).toBe("R2 unreachable");
    }
  });

  test("uptime_s falls back to 0 when uptimeSeconds returns null (covers ?? 0 branch)", async () => {
    // Covers line 75 of handlers/live.ts: the `?? 0` fallback for
    // the uptime field. Default makeMockInfo() returns 42, so the
    // null path was previously unreached.
    const ctx = makeMockCtx({ db, r2, info: makeMockInfo(null) });
    const r = await liveCheckHandler(ctx);
    expect(r.kind).toBe("json");
    if (r.kind === "json") {
      const body = r.body as { uptime_s: number };
      expect(body.uptime_s).toBe(0);
    }
  });
});
