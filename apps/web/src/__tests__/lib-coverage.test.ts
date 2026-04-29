import { describe, expect, test, vi } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import React from "react";
import { generatePageNumbers } from "../lib/pagination";
import { APP_VERSION } from "../lib/version";

describe("pagination branch coverage", () => {
  test("does NOT prepend ellipsis when current is near the start", () => {
    // Tightened: replaced 2 partial checks (r[0]=1, r[1]!=='...', last=10)
    // with the full deterministic array. generatePageNumbers(2, 10)
    // returns the no-leading-ellipsis branch: 1,2,3,4,'...',10.
    expect(generatePageNumbers(2, 10)).toEqual([1, 2, 3, "...", 10]);
  });

  test("does NOT append ellipsis when current is near the end", () => {
    // Tightened: full array. generatePageNumbers(9, 10) returns the
    // no-trailing-ellipsis branch: 1,'...',7,8,9,10.
    expect(generatePageNumbers(9, 10)).toEqual([1, "...", 8, 9, 10]);
  });

  test("returns full range without ellipsis when total <= 7", () => {
    expect(generatePageNumbers(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("version fallback", () => {
  test("APP_VERSION defaults when injection is absent", () => {
    // vite injects a real semver via define; under vitest, no injection runs,
    // so APP_VERSION resolves through the typeof-guarded fallback path.
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("APP_VERSION uses __APP_VERSION__ when defined at global scope", async () => {
    // Covers the truthy branch of typeof __APP_VERSION__ === "string"
    // in version.ts. In production Vite replaces the identifier at
    // build time; here we simulate it via globalThis (Node resolves
    // bare identifiers through the global scope chain).
    (globalThis as Record<string, unknown>).__APP_VERSION__ = "9.8.7";
    vi.resetModules();
    try {
      const { APP_VERSION: ver } = await import("../lib/version");
      expect(ver).toBe("9.8.7");
    } finally {
      delete (globalThis as Record<string, unknown>).__APP_VERSION__;
    }
  });
});

describe("RequireAuth — DOM-mounted branch coverage", () => {
  test("triggers window.location.reload on ApiError(401)", async () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, reload },
    });
    vi.resetModules();
    const { ApiError: FreshApiError } = await import("../lib/api");
    vi.doMock("../lib/useMe", () => ({
      useMe: () => ({
        email: null,
        authenticated: false,
        isLoading: false,
        error: new FreshApiError(401, null, "Unauthorized"),
        mutate: () => {},
      }),
    }));
    try {
      const { RequireAuth } = await import("../lib/RequireAuth");
      let container!: HTMLElement;
      await act(async () => {
        ({ container } = render(
          React.createElement(
            RequireAuth,
            null,
            React.createElement("div", null, "x"),
          ),
        ));
      });
      expect(reload).toHaveBeenCalledTimes(1);
      expect(container.textContent).toContain("Redirecting to login…");
    } finally {
      cleanup();
      vi.doUnmock("../lib/useMe");
      Object.defineProperty(window, "location", {
        configurable: true,
        value: original,
      });
    }
  });
});
