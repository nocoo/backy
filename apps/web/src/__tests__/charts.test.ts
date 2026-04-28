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
    expect(formatBytes(1024 ** 5)).toMatch(/GB$/);
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
    // index % length for negatives can be negative; default branch covers it
    const c = getChartColor(-1);
    expect(c).toMatch(/^hsl\(var\(--chart-\d+\)\)$/);
  });
});
