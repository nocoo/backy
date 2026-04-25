import { beforeEach, describe, expect, test } from "vitest";
import { makeMockCtx, makeMockD1, makeMockR2 } from "../helpers";
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
    expect((r as { body: { status: string } }).body.status).toBe("ok");
  });

  test("returns 503 when D1 throws", async () => {
    db = makeMockD1(async () => {
      throw new Error("db down");
    });

    const r = await liveCheckHandler(makeMockCtx({ db, r2 }));
    expect(r.status).toBe(503);
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
    expect(body.body.dependencies.d1.message).not.toContain("ok");
  });

  test("non-Error throw uses default message", async () => {
    db = makeMockD1(async () => {
      throw "raw";
    });

    const r = await liveCheckHandler(makeMockCtx({ db, r2 }));
    expect(r.status).toBe(503);
  });
});
