import { describe, expect, test } from "vitest";
import { formatLogDate } from "../lib/pagination";

// Surface assertions for `LogsPage` / `CronLogsPage` were removed (TS already
// enforces export shape; page-level rendering is exercised by L3 BDD).
//
// `generatePageNumbers` behaviour is exhaustively covered in backups.test.ts;
// the duplicate cases that used to live here were removed to cut redundancy.

describe("formatLogDate", () => {
  test("produces compact 'Mon D, HH:MM:SS' string", () => {
    const s = formatLogDate("2026-02-24T14:03:21.000Z");
    // Local timezone may shift hour/day, but month/comma/colon shape is fixed.
    expect(s).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{2}:\d{2}:\d{2}$/);
  });

  test("zero-pads single-digit hours/minutes/seconds", () => {
    // Pick an offset-resistant time-of-day: midnight UTC \u00b1 any TZ still
    // yields HH:MM:SS that matches the padding regex below.
    const s = formatLogDate("2026-02-24T00:01:02.000Z");
    expect(s).toMatch(/\b\d{2}:\d{2}:\d{2}$/);
  });

  test("uses 3-letter English month abbreviation", () => {
    const s = formatLogDate("2026-08-15T12:00:00.000Z");
    expect(s).toMatch(/^(?:Aug|Jul|Sep)\b/);
  });
});
