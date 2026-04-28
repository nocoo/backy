import { beforeEach, describe, expect, test } from "vitest";
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
    // Tightened: pin the entire snake_case → camelCase mapping. Catches
    // a regression where the handler swapped column names or dropped the
    // total_size → totalStorageBytes rename.
    expect((r as { body: unknown }).body).toEqual({
      totalProjects: 2,
      totalBackups: 5,
      totalStorageBytes: 100,
    });
  });

  test("totals 200 with empty rows defaults to 0", async () => {
    db = makeMockD1(async () => ({ results: [] }));

    const r = await statsTotalsHandler(makeMockCtx({ db }));
    expect(r.status).toBe(200);
    // Tightened: pin all 3 zeroed defaults instead of just totalBackups.
    expect((r as { body: unknown }).body).toEqual({
      totalProjects: 0,
      totalBackups: 0,
      totalStorageBytes: 0,
    });
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
    // Tightened: with the default empty mock results, the handler must
    // produce 3 empty arrays (no extra fields, no nulls).
    expect((r as { body: unknown }).body).toEqual({
      projectStats: [],
      dailyBackups: [],
      cronStats: [],
    });
  });

  test("charts 500 on db error", async () => {
    db = makeMockD1(async () => {
      throw new Error("db");
    });

    expect((await statsChartsHandler(makeMockCtx({ db }))).status).toBe(500);
  });
});
