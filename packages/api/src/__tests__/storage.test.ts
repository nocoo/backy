import { describe, expect, test, vi } from "vitest";
import {
  generateTimestamp,
  generateBackupKey,
  generatePreviewKey,
} from "@backy/api/backup/storage";

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
    // Pin Date.now() with fake timers so the assertion compares an exact
    // value instead of a ±1ms time-window. Previously this used
    // Date.now()-bracket logic which is very low risk but technically
    // flaky if the clock jitters between the three Date.now() calls.
    const fixed = Date.UTC(2026, 2, 2, 10, 30, 0); // 2026-03-02T10:30:00.000Z
    vi.useFakeTimers();
    vi.setSystemTime(fixed);
    try {
      expect(generateTimestamp()).toBe("2026-03-02T10-30-00-000Z");
    } finally {
      vi.useRealTimers();
    }
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
    // Tightened: assert the full shape with a regex instead of a length
    // sanity check. timestamp segment matches generateTimestamp's output
    // (dashes everywhere, ms precision, trailing Z).
    expect(key).toMatch(
      /^backups\/proj1\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/,
    );
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
    expect(key.startsWith("previews/proj1/")).toBe(true);
    expect(key.endsWith(".json")).toBe(true);
  });

  test("always uses .json extension", () => {
    const key = generatePreviewKey("proj1", ts);
    expect(key.endsWith(".json")).toBe(true);
  });
});
