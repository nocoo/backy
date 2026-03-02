import { describe, expect, test } from "bun:test";
import {
  generateTimestamp,
  generateBackupKey,
  generatePreviewKey,
} from "@/lib/backup/storage";

// ---------------------------------------------------------------------------
// generateTimestamp
// ---------------------------------------------------------------------------

describe("generateTimestamp", () => {
  test("replaces colons and dots with dashes", () => {
    const date = new Date("2026-03-02T10:30:00.000Z");
    expect(generateTimestamp(date)).toBe("2026-03-02T10-30-00-000Z");
  });

  test("returns a string without colons or dots", () => {
    const ts = generateTimestamp();
    expect(ts).not.toContain(":");
    expect(ts).not.toContain(".");
  });

  test("defaults to current time", () => {
    const before = Date.now();
    const ts = generateTimestamp();
    const after = Date.now();
    // Parse back and verify it's within the time window
    const parsed = Date.parse(ts.replace(/-/g, (m, offset: number) => {
      // Restore ISO format: keep first two dashes (date), convert rest back
      if (offset === 4 || offset === 7) return m;
      if (offset === 13 || offset === 16) return ":";
      if (offset === 19) return ".";
      return m;
    }));
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after + 1);
  });
});

// ---------------------------------------------------------------------------
// generateBackupKey
// ---------------------------------------------------------------------------

describe("generateBackupKey", () => {
  const ts = "2026-03-02T10-30-00-000Z";

  test("generates key for json files", () => {
    expect(generateBackupKey("proj1", "json", "data.json", ts))
      .toBe("backups/proj1/2026-03-02T10-30-00-000Z.json");
  });

  test("generates key for zip files", () => {
    expect(generateBackupKey("proj1", "zip", "backup.zip", ts))
      .toBe("backups/proj1/2026-03-02T10-30-00-000Z.zip");
  });

  test("generates key for gz files", () => {
    expect(generateBackupKey("proj1", "gz", "dump.sql.gz", ts))
      .toBe("backups/proj1/2026-03-02T10-30-00-000Z.gz");
  });

  test("generates key for tgz files", () => {
    expect(generateBackupKey("proj1", "tgz", "backup.tar.gz", ts))
      .toBe("backups/proj1/2026-03-02T10-30-00-000Z.tar.gz");
  });

  test("preserves original extension for unknown type", () => {
    expect(generateBackupKey("proj1", "unknown", "dump.sql", ts))
      .toBe("backups/proj1/2026-03-02T10-30-00-000Z.sql");
  });

  test("handles unknown type with no extension", () => {
    expect(generateBackupKey("proj1", "unknown", "backup", ts))
      .toBe("backups/proj1/2026-03-02T10-30-00-000Z");
  });

  test("auto-generates timestamp when not provided", () => {
    const key = generateBackupKey("proj1", "json", "data.json");
    expect(key).toStartWith("backups/proj1/");
    expect(key).toEndWith(".json");
    expect(key.length).toBeGreaterThan("backups/proj1/.json".length);
  });
});

// ---------------------------------------------------------------------------
// generatePreviewKey
// ---------------------------------------------------------------------------

describe("generatePreviewKey", () => {
  const ts = "2026-03-02T10-30-00-000Z";

  test("generates preview key with given timestamp", () => {
    expect(generatePreviewKey("proj1", ts))
      .toBe("previews/proj1/2026-03-02T10-30-00-000Z.json");
  });

  test("auto-generates timestamp when not provided", () => {
    const key = generatePreviewKey("proj1");
    expect(key).toStartWith("previews/proj1/");
    expect(key).toEndWith(".json");
  });

  test("always uses .json extension", () => {
    const key = generatePreviewKey("proj1", ts);
    expect(key).toEndWith(".json");
  });
});
