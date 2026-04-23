import { describe, expect, test, beforeEach, afterEach, spyOn } from "bun:test";
import { mockFetch, d1Success } from "./helpers";

describe("GET /api/stats/charts", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("returns projectStats, dailyBackups, and cronStats", async () => {
    const projectStats = [
      { project_id: "p1", project_name: "Alpha", backup_count: 5, total_size: 1024, latest_backup: "2026-02-20T00:00:00Z" },
      { project_id: "p2", project_name: "Beta", backup_count: 3, total_size: 512, latest_backup: "2026-02-19T00:00:00Z" },
    ];
    const dailyBackups = [
      { date: "2026-02-20", count: 3 },
      { date: "2026-02-21", count: 2 },
    ];
    const cronStats = [
      { date: "2026-02-20", success: 2, failed: 0, skipped: 1, triggered: 0 },
      { date: "2026-02-21", success: 1, failed: 1, skipped: 0, triggered: 0 },
    ];

    let callCount = 0;
    globalThis.fetch = mockFetch(async () => {
      callCount++;
      // 1st → projectStats, 2nd → dailyBackups, 3rd → cronStats
      const data = callCount === 1 ? projectStats : callCount === 2 ? dailyBackups : cronStats;
      return d1Success(data as Record<string, unknown>[]);
    });

    const { GET } = await import("@/app/api/stats/charts/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projectStats).toEqual(projectStats);
    expect(body.dailyBackups).toEqual(dailyBackups);
    expect(body.cronStats).toEqual(cronStats);
  });

  test("returns empty arrays when no data", async () => {
    globalThis.fetch = mockFetch(async () =>
      d1Success([]),
    );

    const { GET } = await import("@/app/api/stats/charts/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projectStats).toEqual([]);
    expect(body.dailyBackups).toEqual([]);
    expect(body.cronStats).toEqual([]);
  });

  test("returns 500 on D1 error", async () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

    globalThis.fetch = mockFetch(async () =>
      new Response("Internal Server Error", { status: 500 }),
    );

    const { GET } = await import("@/app/api/stats/charts/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Failed to fetch chart data");

    consoleSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
