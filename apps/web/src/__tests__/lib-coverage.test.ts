import { describe, expect, test, vi } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import React from "react";
import { generatePageNumbers } from "../lib/pagination";
import { APP_VERSION } from "../lib/version";

describe("pagination branch coverage", () => {
  test("does NOT prepend ellipsis when current is near the start", () => {
    const r = generatePageNumbers(2, 10);
    expect(r[0]).toBe(1);
    expect(r[1]).not.toBe("...");
    expect(r[r.length - 1]).toBe(10);
  });

  test("does NOT append ellipsis when current is near the end", () => {
    const r = generatePageNumbers(9, 10);
    expect(r[0]).toBe(1);
    expect(r[r.length - 1]).toBe(10);
    expect(r[r.length - 2]).not.toBe("...");
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
