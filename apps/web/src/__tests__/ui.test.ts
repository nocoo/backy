import { describe, expect, test } from "vitest";
import { cn } from "../lib/utils";

// "ui primitives importable" smoke test was removed: TS already enforces
// export shape, and the dynamic imports of button/card/dialog/select/
// tooltip/sonner each pulled in a radix-ui package (collectively ~150ms
// of vitest module-load time) for zero behavioral coverage. Visual /
// interaction behaviour belongs in L3 (BDD/Playwright).

describe("cn", () => {
  test("merges class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  test("dedupes conflicting tailwind classes (last wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  test("filters falsy values", () => {
    expect(cn("a", false && "b", null, undefined, "c")).toBe("a c");
  });

  test("handles arrays + objects via clsx", () => {
    expect(cn(["a", "b"], { c: true, d: false })).toBe("a b c");
  });
});
