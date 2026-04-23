import { describe, expect, test, beforeEach, mock } from "bun:test";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockExecuteD1Query: (...args: any[]) => Promise<any[]> = async () => [];

mock.module("../../lib/db/d1-client", () => ({
  executeD1Query: (...args: unknown[]) => mockExecuteD1Query(...args),
  isD1Configured: () => true,
}));

const { statsTotalsHandler, statsChartsHandler } = await import(
  "../../handlers/stats"
);

describe("stats handlers", () => {
  beforeEach(() => {
    mockExecuteD1Query = async () => [];
  });

  test("totals 200 with rows", async () => {
    mockExecuteD1Query = async () => [
      { total_projects: 2, total_backups: 5, total_size: 100 },
    ];
    const r = await statsTotalsHandler();
    expect(r.status).toBe(200);
    expect((r as { body: { totalProjects: number } }).body.totalProjects).toBe(
      2,
    );
  });

  test("totals 200 with empty rows defaults to 0", async () => {
    mockExecuteD1Query = async () => [];
    const r = await statsTotalsHandler();
    expect(r.status).toBe(200);
    expect((r as { body: { totalBackups: number } }).body.totalBackups).toBe(0);
  });

  test("totals 500 on db error", async () => {
    mockExecuteD1Query = async () => {
      throw new Error("db");
    };
    expect((await statsTotalsHandler()).status).toBe(500);
  });

  test("charts 200 with data", async () => {
    mockExecuteD1Query = async () => [];
    const r = await statsChartsHandler();
    expect(r.status).toBe(200);
  });

  test("charts 500 on db error", async () => {
    mockExecuteD1Query = async () => {
      throw new Error("db");
    };
    expect((await statsChartsHandler()).status).toBe(500);
  });
});
