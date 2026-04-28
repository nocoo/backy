import { describe, expect, test } from "vitest";
import { Folder, FolderKanban } from "lucide-react";
import {
  CATEGORY_ICONS,
  CATEGORY_COLORS,
  getCategoryIcon,
} from "../lib/category-icons";

// Surface assertions like `typeof ProjectsPage === "function"` were removed:
// the TypeScript compiler already enforces the export shape, and the heavy
// page imports added ~40ms of vitest module-load with zero behavioral
// coverage. Page-level rendering is exercised by L3 (BDD/Playwright).

describe("category-icons", () => {
  test("CATEGORY_ICONS has 20 entries", () => {
    expect(CATEGORY_ICONS.length).toBe(20);
  });

  test("CATEGORY_COLORS has 10 entries", () => {
    expect(CATEGORY_COLORS.length).toBe(10);
    for (const c of CATEGORY_COLORS) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  test("getCategoryIcon resolves a known name", () => {
    expect(getCategoryIcon("folder-kanban")).toBe(FolderKanban);
  });

  test("getCategoryIcon falls back to Folder for unknown name", () => {
    expect(getCategoryIcon("not-a-real-icon")).toBe(Folder);
  });
});
