import { describe, expect, test } from "vitest";
import { LogsPage } from "../pages/logs";
import { CronLogsPage } from "../pages/cron-logs";
import { generatePageNumbers, formatLogDate } from "../lib/pagination";

describe("logs pages surface", () => {
  test("LogsPage is a function component", () => {
    expect(typeof LogsPage).toBe("function");
  });

  test("CronLogsPage is a function component", () => {
    expect(typeof CronLogsPage).toBe("function");
  });
});

describe("pagination helpers (re-asserted via shared module)", () => {
  test("generatePageNumbers respects boundaries for total <= 7", () => {
    expect(generatePageNumbers(1, 1)).toEqual([1]);
    expect(generatePageNumbers(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test("generatePageNumbers collapses both sides in the middle", () => {
    const r = generatePageNumbers(5, 10);
    expect(r[0]).toBe(1);
    expect(r[r.length - 1]).toBe(10);
    expect(r.filter((p) => p === "...").length).toBe(2);
  });

  test("formatLogDate produces compact 'Mon D, HH:MM:SS' string", () => {
    const s = formatLogDate("2026-02-24T14:03:21.000Z");
    // Local timezone may shift hour/day, but month/comma/colon shape is fixed.
    expect(s).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{2}:\d{2}:\d{2}$/);
  });
});
