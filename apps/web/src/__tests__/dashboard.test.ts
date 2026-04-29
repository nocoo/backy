import { describe, expect, test } from "vitest";
import { formatBytes, formatDate, formatDateOnly } from "../lib/format";

// `DashboardPage is a function component` was removed (TS already enforces
// it; importing the page dragged in recharts/lucide for zero behavioral
// coverage). Page-level rendering belongs in L3 (BDD/Playwright).

describe("format helpers", () => {
  test("formatBytes covers boundaries", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1024 ** 4)).toBe("1 TB");
  });

  test("formatBytes clamps very large values to TB", () => {
    // Tightened: pin exact "1048576 TB" — i is clamped at sizes.length-1=4
    // (no PB/EB unit), so 1024^6 / 1024^4 = 1024^2 = 1048576 TB.
    // Catches a regression that adds new units without bumping clamp.
    expect(formatBytes(1024 ** 6)).toBe("1048576 TB");
  });

  test("formatDate emits month + day + HH:MM (no year)", () => {
    const out = formatDate("2026-04-24T10:00:00Z");
    // Locale-stable shape: 3-letter month + day + HH:MM. We deliberately
    // do NOT assert on the year (formatDate intentionally omits it for
    // compactness) or on the exact hour (varies by TZ in CI vs local).
    expect(out).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2}/);
  });

  test("formatDateOnly emits the year (Mmm D, YYYY)", () => {
    const out = formatDateOnly("2026-04-24T00:00:00Z");
    expect(out).toMatch(/^[A-Z][a-z]{2} \d{1,2}, 2026$/);
  });
});
