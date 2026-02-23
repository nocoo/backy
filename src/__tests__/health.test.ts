import { describe, expect, test, beforeEach, mock } from "bun:test";

// --- Module-level mocks (must be set before importing the route) ---

let mockIsD1Configured = true;
let mockIsR2Configured = true;
let mockExecuteD1Query: () => Promise<unknown[]> = async () => [{ 1: 1 }];
let mockPingR2: () => Promise<void> = async () => {};

mock.module("@/lib/db/d1-client", () => ({
  isD1Configured: () => mockIsD1Configured,
  executeD1Query: () => mockExecuteD1Query(),
  D1Response: {},
}));

mock.module("@/lib/r2/client", () => ({
  isR2Configured: () => mockIsR2Configured,
  pingR2: () => mockPingR2(),
  resetR2Client: () => {},
  uploadToR2: async () => {},
  downloadFromR2: async () => ({ body: null, contentType: "application/octet-stream", contentLength: 0 }),
  createPresignedDownloadUrl: async () => "https://mock.example.com/signed",
  deleteFromR2: async () => {},
  deleteMultipleFromR2: async () => 0,
  listR2Objects: async () => [],
}));

// Import AFTER mocks are registered
const { GET } = await import("@/app/api/live/route");

describe("/api/live", () => {
  beforeEach(() => {
    // Reset to healthy defaults
    mockIsD1Configured = true;
    mockIsR2Configured = true;
    mockExecuteD1Query = async () => [{ 1: 1 }];
    mockPingR2 = async () => {};
  });

  test("returns status ok when all dependencies are healthy", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
    expect(body.version).toBeDefined();
    expect(typeof body.uptime_s).toBe("number");
    expect(body.dependencies.d1.status).toBe("up");
    expect(typeof body.dependencies.d1.latency_ms).toBe("number");
    expect(body.dependencies.r2.status).toBe("up");
    expect(typeof body.dependencies.r2.latency_ms).toBe("number");
  });

  test("returns no-cache headers", async () => {
    const response = await GET();

    expect(response.headers.get("Cache-Control")).toBe("no-store, no-cache, must-revalidate");
    expect(response.headers.get("Pragma")).toBe("no-cache");
  });

  test("returns 503 and status error when D1 is down", async () => {
    mockExecuteD1Query = async () => { throw new Error("D1 query failed"); };

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("error");
    expect(body.dependencies.d1.status).toBe("down");
    expect(body.dependencies.d1.message).toBeDefined();
    expect(body.dependencies.r2.status).toBe("up");
    // "ok" must never appear in error response
    expect(JSON.stringify(body)).not.toContain('"ok"');
  });

  test("returns 503 and status error when R2 is down", async () => {
    mockPingR2 = async () => { throw new Error("R2 connection refused"); };

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("error");
    expect(body.dependencies.d1.status).toBe("up");
    expect(body.dependencies.r2.status).toBe("down");
    expect(body.dependencies.r2.message).toBe("R2 connection refused");
    expect(JSON.stringify(body)).not.toContain('"ok"');
  });

  test("returns 503 when both D1 and R2 are down", async () => {
    mockExecuteD1Query = async () => { throw new Error("D1 unavailable"); };
    mockPingR2 = async () => { throw new Error("R2 unavailable"); };

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("error");
    expect(body.dependencies.d1.status).toBe("down");
    expect(body.dependencies.r2.status).toBe("down");
    expect(JSON.stringify(body)).not.toContain('"ok"');
  });

  test("reports D1 not configured when isD1Configured returns false", async () => {
    mockIsD1Configured = false;

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("error");
    expect(body.dependencies.d1.status).toBe("down");
    expect(body.dependencies.d1.message).toBe("D1 credentials not configured");
    expect(body.dependencies.d1.latency_ms).toBe(0);
    expect(JSON.stringify(body)).not.toContain('"ok"');
  });

  test("reports R2 not configured when isR2Configured returns false", async () => {
    mockIsR2Configured = false;

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("error");
    expect(body.dependencies.d1.status).toBe("up");
    expect(body.dependencies.r2.status).toBe("down");
    expect(body.dependencies.r2.message).toBe("R2 credentials not configured");
    expect(body.dependencies.r2.latency_ms).toBe(0);
    expect(JSON.stringify(body)).not.toContain('"ok"');
  });

  test("sanitizes 'ok' from error messages", async () => {
    mockExecuteD1Query = async () => { throw new Error("token not ok for auth"); };
    mockPingR2 = async () => { throw new Error("ok bucket lookup failed"); };

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.dependencies.d1.message).not.toMatch(/\bok\b/i);
    expect(body.dependencies.r2.message).not.toMatch(/\bok\b/i);
    expect(body.dependencies.d1.message).toContain("***");
    expect(body.dependencies.r2.message).toContain("***");
  });

  test("handles non-Error exceptions gracefully", async () => {
    mockExecuteD1Query = async () => { throw "string error"; };
    mockPingR2 = async () => { throw 42; };

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.dependencies.d1.status).toBe("down");
    expect(body.dependencies.d1.message).toBe("D1 unreachable");
    expect(body.dependencies.r2.status).toBe("down");
    expect(body.dependencies.r2.message).toBe("R2 unreachable");
    expect(JSON.stringify(body)).not.toContain('"ok"');
  });

  test("returns latency_ms as a non-negative integer", async () => {
    const response = await GET();
    const body = await response.json();

    expect(body.dependencies.d1.latency_ms).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(body.dependencies.d1.latency_ms)).toBe(true);
    expect(body.dependencies.r2.latency_ms).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(body.dependencies.r2.latency_ms)).toBe(true);
  });

  test("returns uptime_s as a non-negative integer", async () => {
    const response = await GET();
    const body = await response.json();

    expect(body.uptime_s).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(body.uptime_s)).toBe(true);
  });

  test("returns valid ISO 8601 timestamp", async () => {
    const response = await GET();
    const body = await response.json();

    const parsed = new Date(body.timestamp);
    expect(parsed.toISOString()).toBe(body.timestamp);
  });
});
