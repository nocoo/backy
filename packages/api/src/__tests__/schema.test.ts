import { describe, expect, test } from "vitest";
import { initializeSchema } from "../lib/db/schema";
import { makeMockD1 } from "./helpers";

describe("initializeSchema", () => {
  test("creates direct_uploads and unique backups.file_key after base tables", async () => {
    const db = makeMockD1();
    await initializeSchema(db);
    const sql = db.calls.map((c) => c.sql);
    expect(sql.some((s) => s.includes("CREATE TABLE IF NOT EXISTS direct_uploads"))).toBe(
      true,
    );
    expect(sql.some((s) => s.includes("idx_direct_uploads_gc"))).toBe(true);
    expect(
      sql.some((s) =>
        s.includes("CREATE UNIQUE INDEX IF NOT EXISTS idx_backups_file_key"),
      ),
    ).toBe(true);
    const uniqueIdx = sql.findIndex((s) =>
      s.includes("CREATE UNIQUE INDEX IF NOT EXISTS idx_backups_file_key"),
    );
    const preflight = sql.findIndex((s) =>
      s.includes("GROUP BY file_key HAVING COUNT(*) > 1"),
    );
    expect(preflight).toBeGreaterThan(-1);
    expect(uniqueIdx).toBeGreaterThan(preflight);
  });

  test("refuses unique file_key index when duplicates exist", async () => {
    const db = makeMockD1((sql) => {
      if (sql.includes("GROUP BY file_key HAVING COUNT(*) > 1")) {
        return { results: [{ file_key: "backups/p/a.zip", n: 2 }] };
      }
      return { results: [] };
    });
    await expect(initializeSchema(db)).rejects.toThrow(
      /duplicate key/,
    );
    expect(
      db.calls.some((c) =>
        c.sql.includes("CREATE UNIQUE INDEX IF NOT EXISTS idx_backups_file_key"),
      ),
    ).toBe(false);
  });
});
