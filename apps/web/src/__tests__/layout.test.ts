import { describe, expect, test } from "vitest";
import { getAvatarColor } from "../components/layout/sidebar";
import { APP_VERSION } from "../lib/version";

// Surface "X is a function component" assertions removed: TS already
// enforces export shape; the imports of AppShell / Sidebar / Breadcrumbs
// / ThemeToggle / SidebarProvider / useSidebar /
// useIsMobile dragged in radix-ui + lucide for zero behavioral coverage.
// Layout rendering belongs in L3 (BDD/Playwright).

describe("getAvatarColor", () => {
  test("returns a stable color for the same name", () => {
    expect(getAvatarColor("alice")).toBe(getAvatarColor("alice"));
  });

  test("returns one of the AVATAR_COLORS palette values", () => {
    const palette = new Set([
      "bg-red-600",
      "bg-orange-600",
      "bg-amber-600",
      "bg-emerald-600",
      "bg-teal-600",
      "bg-cyan-600",
      "bg-blue-600",
      "bg-indigo-600",
      "bg-violet-600",
      "bg-pink-600",
    ]);
    for (const name of ["a", "bb", "longer-name", "你好", ""]) {
      expect(palette.has(getAvatarColor(name))).toBe(true);
    }
  });

  test("empty input maps to first palette slot deterministically", () => {
    expect(getAvatarColor("")).toBe("bg-red-600");
  });
});

describe("APP_VERSION", () => {
  test("matches semver shape", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
