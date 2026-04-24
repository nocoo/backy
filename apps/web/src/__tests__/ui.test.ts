import { describe, expect, test } from "bun:test";
import { cn } from "../lib/utils";

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

describe("ui primitives importable", () => {
  test("button + card + dialog + select + tooltip + sonner exports exist", async () => {
    const button = await import("../components/ui/button");
    const card = await import("../components/ui/card");
    const dialog = await import("../components/ui/dialog");
    const select = await import("../components/ui/select");
    const tooltip = await import("../components/ui/tooltip");
    const sonner = await import("../components/ui/sonner");
    expect(typeof button.Button).toBe("function");
    expect(typeof card.Card).toBe("function");
    expect(typeof dialog.Dialog).toBe("function");
    expect(typeof select.Select).toBe("function");
    expect(typeof tooltip.Tooltip).toBe("function");
    expect(typeof sonner.Toaster).toBe("function");
  });
});
