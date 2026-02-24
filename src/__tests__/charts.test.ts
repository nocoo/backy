import { describe, expect, test, beforeEach, afterEach, spyOn } from "bun:test";

/** Create a mock fetch that satisfies Bun's typeof fetch (includes preconnect). */
function mockFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): typeof globalThis.fetch {
  const fn = handler as typeof globalThis.fetch;
  fn.preconnect = () => {};
  return fn;
}

/** D1 success response helper. */
function d1Response<T>(results: T[]) {
  return JSON.stringify({
    success: true,
    result: [{ results, success: true, meta: { changes: 0, last_row_id: 0 } }],
    errors: [],
  });
}

describe("GET /api/stats/charts", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("returns projectStats and dailyBackups", async () => {
    const projectStats = [
      { project_id: "p1", project_name: "Alpha", backup_count: 5, total_size: 1024, latest_backup: "2026-02-20T00:00:00Z" },
      { project_id: "p2", project_name: "Beta", backup_count: 3, total_size: 512, latest_backup: "2026-02-19T00:00:00Z" },
    ];
    const dailyBackups = [
      { date: "2026-02-20", count: 3 },
      { date: "2026-02-21", count: 2 },
    ];

    let callCount = 0;
    globalThis.fetch = mockFetch(async () => {
      callCount++;
      // First call returns projectStats, second returns dailyBackups
      const data = callCount === 1 ? projectStats : dailyBackups;
      return new Response(d1Response(data as Record<string, unknown>[]), { status: 200 });
    });

    const { GET } = await import("@/app/api/stats/charts/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projectStats).toEqual(projectStats);
    expect(body.dailyBackups).toEqual(dailyBackups);
  });

  test("returns empty arrays when no data", async () => {
    globalThis.fetch = mockFetch(async () =>
      new Response(d1Response([]), { status: 200 }),
    );

    const { GET } = await import("@/app/api/stats/charts/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projectStats).toEqual([]);
    expect(body.dailyBackups).toEqual([]);
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
