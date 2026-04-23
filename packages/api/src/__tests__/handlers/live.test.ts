import { describe, expect, test, beforeEach, mock } from "bun:test";

let mockIsD1Configured = () => true;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockExecuteD1Query: (...args: any[]) => Promise<any[]> = async () => [
  { ok: 1 },
];
let mockIsR2Configured = () => true;
let mockPingR2: () => Promise<void> = async () => {};

mock.module("../../lib/db/d1-client", () => ({
  executeD1Query: (...args: unknown[]) => mockExecuteD1Query(...args),
  isD1Configured: () => mockIsD1Configured(),
}));

mock.module("../../lib/r2/client", () => ({
  pingR2: () => mockPingR2(),
  isR2Configured: () => mockIsR2Configured(),
}));

const { liveCheckHandler } = await import("../../handlers/live");

describe("live handler", () => {
  beforeEach(() => {
    mockIsD1Configured = () => true;
    mockIsR2Configured = () => true;
    mockExecuteD1Query = async () => [{ ok: 1 }];
    mockPingR2 = async () => {};
  });

  test("returns 200 when both up", async () => {
    const r = await liveCheckHandler();
    expect(r.status).toBe(200);
    expect(
      (r as { body: { status: string } }).body.status,
    ).toBe("ok");
  });

  test("returns 503 when D1 not configured", async () => {
    mockIsD1Configured = () => false;
    const r = await liveCheckHandler();
    expect(r.status).toBe(503);
  });

  test("returns 503 when R2 not configured", async () => {
    mockIsR2Configured = () => false;
    const r = await liveCheckHandler();
    expect(r.status).toBe(503);
  });

  test("returns 503 when D1 throws", async () => {
    mockExecuteD1Query = async () => {
      throw new Error("db down");
    };
    const r = await liveCheckHandler();
    expect(r.status).toBe(503);
  });

  test("returns 503 when R2 throws", async () => {
    mockPingR2 = async () => {
      throw new Error("r2 down");
    };
    const r = await liveCheckHandler();
    expect(r.status).toBe(503);
  });

  test("sanitizes 'ok' from error messages", async () => {
    mockExecuteD1Query = async () => {
      throw new Error("not ok message");
    };
    const r = await liveCheckHandler();
    const body = r as {
      body: { dependencies: { d1: { message?: string } } };
    };
    expect(body.body.dependencies.d1.message).not.toContain("ok");
  });

  test("non-Error throw uses default message", async () => {
    mockExecuteD1Query = async () => {
      throw "raw";
    };
    const r = await liveCheckHandler();
    expect(r.status).toBe(503);
  });
});
