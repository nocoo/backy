import { describe, expect, test } from "vitest";
import { AppShell } from "../components/layout/app-shell";
import {
  Sidebar,
  getAvatarColor,
} from "../components/layout/sidebar";
import {
  SidebarProvider,
  useSidebar,
} from "../components/layout/sidebar-context";
import { Breadcrumbs } from "../components/layout/breadcrumbs";
import { ThemeToggle } from "../components/layout/theme-toggle";
import { LoadingScreen } from "../components/loading-screen";
import { useIsMobile } from "../hooks/use-mobile";
import { APP_VERSION } from "../lib/version";

describe("layout component surface", () => {
  test("AppShell + Sidebar + Breadcrumbs + ThemeToggle are functions", () => {
    expect(typeof AppShell).toBe("function");
    expect(typeof Sidebar).toBe("function");
    expect(typeof Breadcrumbs).toBe("function");
    expect(typeof ThemeToggle).toBe("function");
    expect(typeof LoadingScreen).toBe("function");
  });

  test("SidebarProvider + useSidebar are functions", () => {
    expect(typeof SidebarProvider).toBe("function");
    expect(typeof useSidebar).toBe("function");
  });

  test("useIsMobile is a function", () => {
    expect(typeof useIsMobile).toBe("function");
  });
});

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
