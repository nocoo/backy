import { describe, expect, test, beforeEach, afterEach, spyOn } from "bun:test";
import { mockFetch, d1Success } from "./helpers";

describe("/api/stats", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("returns dashboard statistics", async () => {
    globalThis.fetch = mockFetch(async () =>
      d1Success([
        { total_projects: 5, total_backups: 42, total_size: 1048576 },
      ] as Record<string, unknown>[]),
    );

    const { GET } = await import("@/app/api/stats/route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.totalProjects).toBe(5);
    expect(body.totalBackups).toBe(42);
    expect(body.totalStorageBytes).toBe(1048576);
  });

  test("returns zeros when no data", async () => {
    globalThis.fetch = mockFetch(async () => d1Success([]));

    const { GET } = await import("@/app/api/stats/route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.totalProjects).toBe(0);
    expect(body.totalBackups).toBe(0);
    expect(body.totalStorageBytes).toBe(0);
  });

  test("returns 500 on error", async () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

    globalThis.fetch = mockFetch(async () =>
      new Response("Internal Server Error", { status: 500 }),
    );

    const { GET } = await import("@/app/api/stats/route");
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to fetch stats");

    consoleSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
