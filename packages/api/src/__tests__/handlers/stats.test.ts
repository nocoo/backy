import { beforeEach, describe, expect, test } from "bun:test";
import { makeMockCtx, makeMockD1 } from "../helpers";
import { statsChartsHandler, statsTotalsHandler } from "../../handlers/stats";

describe("stats handlers", () => {
  let db: ReturnType<typeof makeMockD1>;

  beforeEach(() => {
    db = makeMockD1(async (sql) => {
      if (sql.includes("COUNT(*) FROM projects")) {
        return {
          results: [
            { total_projects: 0, total_backups: 0, total_size: 0 },
          ],
        };
      }
      return { results: [] };
    });
  });

  test("totals 200 with rows", async () => {
    db = makeMockD1(async () => ({
      results: [
        { total_projects: 2, total_backups: 5, total_size: 100 },
      ],
    }));

    const r = await statsTotalsHandler(makeMockCtx({ db }));
    expect(r.status).toBe(200);
    expect((r as { body: { totalProjects: number } }).body.totalProjects).toBe(
      2,
    );
  });

  test("totals 200 with empty rows defaults to 0", async () => {
    db = makeMockD1(async () => ({ results: [] }));

    const r = await statsTotalsHandler(makeMockCtx({ db }));
    expect(r.status).toBe(200);
    expect((r as { body: { totalBackups: number } }).body.totalBackups).toBe(0);
  });

  test("totals 500 on db error", async () => {
    db = makeMockD1(async () => {
      throw new Error("db");
    });

    expect((await statsTotalsHandler(makeMockCtx({ db }))).status).toBe(500);
  });

  test("charts 200 with data", async () => {
    const r = await statsChartsHandler(makeMockCtx({ db }));
    expect(r.status).toBe(200);
  });

  test("charts 500 on db error", async () => {
    db = makeMockD1(async () => {
      throw new Error("db");
    });

    expect((await statsChartsHandler(makeMockCtx({ db }))).status).toBe(500);
  });
});
