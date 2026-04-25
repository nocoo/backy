import { describe, expect, test } from "vitest";
import { JsonTreeViewer } from "../components/json-tree-viewer";
import { BackupsPage, generatePageNumbers } from "../pages/backups";
import { BackupDetailPage } from "../pages/backup-detail";

describe("generatePageNumbers", () => {
  test("returns 1..N for total <= 7", () => {
    expect(generatePageNumbers(1, 1)).toEqual([1]);
    expect(generatePageNumbers(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test("collapses tail when current is near start", () => {
    const r = generatePageNumbers(2, 10);
    expect(r[0]).toBe(1);
    expect(r[r.length - 1]).toBe(10);
    expect(r).toContain("...");
  });

  test("collapses head when current is near end", () => {
    const r = generatePageNumbers(9, 10);
    expect(r[0]).toBe(1);
    expect(r[r.length - 1]).toBe(10);
    expect(r).toContain("...");
  });

  test("two ellipses for current in the middle", () => {
    const r = generatePageNumbers(5, 10);
    const ellipses = r.filter((p) => p === "...").length;
    expect(ellipses).toBe(2);
    expect(r[0]).toBe(1);
    expect(r[r.length - 1]).toBe(10);
    expect(r).toContain(4);
    expect(r).toContain(5);
    expect(r).toContain(6);
  });
});

describe("Backups page surface", () => {
  test("BackupsPage is a function component", () => {
    expect(typeof BackupsPage).toBe("function");
  });

  test("BackupDetailPage is a function component", () => {
    expect(typeof BackupDetailPage).toBe("function");
  });

  test("JsonTreeViewer is a function component", () => {
    expect(typeof JsonTreeViewer).toBe("function");
  });
});
