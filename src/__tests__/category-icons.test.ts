import { describe, expect, test } from "bun:test";
import {
  CATEGORY_ICONS,
  CATEGORY_COLORS,
  getCategoryIcon,
} from "@/lib/category-icons";
import { Folder } from "lucide-react";

describe("CATEGORY_ICONS", () => {
  test("has at least 10 icon entries", () => {
    expect(CATEGORY_ICONS.length).toBeGreaterThanOrEqual(10);
  });

  test("each entry has name, label, and icon", () => {
    for (const entry of CATEGORY_ICONS) {
      expect(typeof entry.name).toBe("string");
      expect(entry.name.length).toBeGreaterThan(0);
      expect(typeof entry.label).toBe("string");
      expect(entry.label.length).toBeGreaterThan(0);
      expect(typeof entry.icon).toBe("object");
    }
  });

  test("has unique names", () => {
    const names = CATEGORY_ICONS.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("CATEGORY_COLORS", () => {
  test("has at least 5 colors", () => {
    expect(CATEGORY_COLORS.length).toBeGreaterThanOrEqual(5);
  });

  test("each color is a valid hex string", () => {
    for (const color of CATEGORY_COLORS) {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  test("has unique colors", () => {
    expect(new Set(CATEGORY_COLORS).size).toBe(CATEGORY_COLORS.length);
  });
});

describe("getCategoryIcon", () => {
  test("returns the correct icon for a known name", () => {
    const icon = getCategoryIcon("folder");
    expect(icon).toBe(Folder);
  });

  test("returns Folder as fallback for unknown name", () => {
    const icon = getCategoryIcon("nonexistent-icon-xyz");
    expect(icon).toBe(Folder);
  });

  test("returns Folder as fallback for empty string", () => {
    const icon = getCategoryIcon("");
    expect(icon).toBe(Folder);
  });

  test("resolves all registered icons", () => {
    for (const entry of CATEGORY_ICONS) {
      const icon = getCategoryIcon(entry.name);
      expect(icon).toBe(entry.icon);
    }
  });
});
