import { describe, expect, test } from "vitest";
import { generatePageNumbers } from "../lib/pagination";

// Surface assertions for `BackupsPage` / `BackupDetailPage` / `JsonTreeViewer`
// were removed (TS already enforces export shape; the imports dragged in the
// pages module + json-tree-viewer for zero behavioral coverage). Page-level
// rendering belongs in L3 (BDD/Playwright).
//
// Note: pages/backups.tsx ALSO exports a `generatePageNumbers` that is a
// byte-for-byte duplicate of lib/pagination.ts's. Tests now exercise the
// canonical lib/ implementation only; the duplicate in pages/backups should
// be deleted in a follow-up (out of scope here \u2014 production code is
// off-limits for this autoresearch session).

describe("generatePageNumbers", () => {
  test("returns 1..N for total <= 7", () => {
    expect(generatePageNumbers(1, 1)).toEqual([1]);
    expect(generatePageNumbers(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test("collapses tail when current is near start", () => {
    // Tightened: pin the full array shape. generatePageNumbers is fully
    // deterministic for (current, total), so equality catches anchor /
    // ellipsis-position regressions that toContain("...") would miss.
    expect(generatePageNumbers(2, 10)).toEqual([1, 2, 3, "...", 10]);
  });

  test("collapses head when current is near end", () => {
    expect(generatePageNumbers(9, 10)).toEqual([1, "...", 8, 9, 10]);
  });

  test("two ellipses for current in the middle", () => {
    expect(generatePageNumbers(5, 10)).toEqual([1, "...", 4, 5, 6, "...", 10]);
  });
});
