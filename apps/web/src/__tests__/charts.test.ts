import { describe, expect, test } from "vitest";
import {
  formatBytes,
  truncateProjectName,
  getChartColor,
} from "../components/charts/project-charts";

// Recharts surface assertions for `DailyBackupsChart` / `CronActivityChart`
// / `BackupsByProjectChart` / `StorageByProjectChart` were removed: TS
// already enforces the export shape, and the imports dragged in recharts
// + d3-scale for zero behavioral coverage. Chart rendering belongs in
// L3 (BDD/Playwright) where SVG output can actually be inspected.

describe("formatBytes", () => {
  test("0 bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  test("bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  test("KB", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  test("MB", () => {
    expect(formatBytes(1024 * 1024)).toBe("1 MB");
  });

  test("GB", () => {
    expect(formatBytes(1024 * 1024 * 1024 * 2.5)).toBe("2.5 GB");
  });

  test("clamps unit index for very large values", () => {
    // Tightened: pin exact "1048576 GB" — i is clamped at sizes.length-1=3
    // (no PB/EB unit), so 1024^5 / 1024^3 = 1024^2 = 1048576 GB.
    // Catches a regression that adds new units without bumping the
    // clamp.
    expect(formatBytes(1024 ** 5)).toBe("1048576 GB");
  });
});

describe("truncateProjectName", () => {
  test("short name unchanged", () => {
    expect(truncateProjectName("backy")).toBe("backy");
  });

  test("12-char boundary unchanged", () => {
    expect(truncateProjectName("123456789012")).toBe("123456789012");
  });

  test("longer names get ellipsis", () => {
    expect(truncateProjectName("1234567890123")).toBe("123456789012...");
  });
});

describe("getChartColor", () => {
  test("wraps around CHART_COLORS palette", () => {
    expect(getChartColor(0)).toBe("hsl(var(--chart-1))");
    expect(getChartColor(5)).toBe(getChartColor(0));
  });

  test("negative wraps to a palette entry", () => {
    // Tightened: pin exact value. JS — -1 % 5 = -1, CHART_COLORS[-1] is
    // undefined, the `?? CHART_COLORS[0]` fallback returns chart-1.
    // This documents the negative-index branch is handled by the ?? fallback,
    // not by a Math.abs / proper modulo wrap.
    expect(getChartColor(-1)).toBe("hsl(var(--chart-1))");
  });
});
