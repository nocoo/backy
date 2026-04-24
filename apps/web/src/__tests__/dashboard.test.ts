import { describe, expect, test } from "bun:test";
import { formatBytes, formatDate, formatDateOnly } from "../lib/format";
import { DashboardPage } from "../pages/dashboard";

describe("format helpers", () => {
  test("formatBytes covers boundaries", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1024 ** 4)).toBe("1 TB");
  });

  test("formatBytes clamps very large values to TB", () => {
    expect(formatBytes(1024 ** 6)).toMatch(/TB$/);
  });

  test("formatDate returns a non-empty string", () => {
    const out = formatDate("2026-04-24T10:00:00Z");
    expect(out.length).toBeGreaterThan(0);
  });

  test("formatDateOnly returns Mmm D, YYYY-style string", () => {
    const out = formatDateOnly("2026-04-24T00:00:00Z");
    expect(out).toMatch(/2026/);
  });
});

describe("DashboardPage", () => {
  test("is a function component", () => {
    expect(typeof DashboardPage).toBe("function");
  });
});
