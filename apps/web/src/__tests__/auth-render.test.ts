// Minimal DOM-rendering tests for the auth/session shim.
// Stubs globalThis.fetch so the real api/swrFetcher path runs end-to-end;
// happy-dom provides window/document via vitest's `environment: happy-dom`.
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const originalFetch = globalThis.fetch;

beforeAll(() => {
  const stub = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/me")) {
      return new Response(
        JSON.stringify({ authenticated: true, email: "you@example.com" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  // Bun's typeof fetch carries `preconnect` — stub it via unknown cast.
  (stub as unknown as { preconnect: (url: string) => void }).preconnect =
    () => {};
  globalThis.fetch = stub;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../lib/useMe");
});

const { useMe } = await import("../lib/useMe");
const { CF_ACCESS_LOGOUT_URL } = await import("../lib/RequireAuth");
const { ApiError } = await import("../lib/api");

describe("useMe", () => {
  test("returns the expected initial shape (no data on first render)", () => {
    let snapshot: ReturnType<typeof useMe> | null = null;
    function Probe() {
      snapshot = useMe();
      return null;
    }
    renderToStaticMarkup(React.createElement(Probe));
    expect(snapshot).not.toBeNull();
    // Tightened: consolidate 4 single-property checks into one
    // toMatchObject pinning the full default useMe() shape (when SWR
    // hasn't fetched yet). Catches a missing field (mutate) or a
    // changed default value (e.g. authenticated:undefined vs false).
    expect(snapshot).toMatchObject({
      email: null,
      authenticated: false,
      isLoading: true,
      mutate: expect.any(Function),
    });
  });
});

describe("RequireAuth", () => {
  test("renders the loading shim while session is undetermined", async () => {
    // Mock useMe to a deterministic loading state. Previously this test
    // relied on the real SWR hook returning isLoading:true on first render,
    // which is fragile under `isolate:false` (sibling test files can
    // populate the SWR module state during their own imports).
    vi.doMock("../lib/useMe", () => ({
      useMe: () => ({
        email: null,
        authenticated: false,
        isLoading: true,
        error: undefined,
        mutate: () => {},
      }),
    }));
    const { RequireAuth: RA } = await import("../lib/RequireAuth");
    const html = renderToStaticMarkup(
      React.createElement(
        RA,
        null,
        React.createElement("div", null, "secret"),
      ),
    );
    expect(html).toContain("Loading…");
  });

  test("CF Access logout URL is the canonical one", () => {
    expect(CF_ACCESS_LOGOUT_URL).toBe(
      "https://nocoo.cloudflareaccess.com/cdn-cgi/access/logout",
    );
  });

  test("ApiError carries status/body and is throwable", () => {
    const err = new ApiError(401, { code: "x" }, "Unauthorized");
    expect(err.status).toBe(401);
    expect((err.body as { code: string }).code).toBe("x");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ApiError");
  });

  test("renders 'Redirecting to login' when session has no email", async () => {
    vi.doMock("../lib/useMe", () => ({
      useMe: () => ({
        email: null,
        authenticated: false,
        isLoading: false,
        error: undefined,
        mutate: () => {},
      }),
    }));
    const { RequireAuth: RA } = await import("../lib/RequireAuth");
    const html = renderToStaticMarkup(
      React.createElement(RA, null, React.createElement("div", null, "x")),
    );
    expect(html).toContain("Redirecting to login…");
  });

  test("renders the 401 redirect branch when ApiError(401) surfaces", async () => {
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
    const { RequireAuth: RA } = await import("../lib/RequireAuth");
    const html = renderToStaticMarkup(
      React.createElement(RA, null, React.createElement("div", null, "x")),
    );
    expect(html).toContain("Redirecting to login…");
  });

  test("renders the generic error branch for non-401 errors", async () => {
    vi.doMock("../lib/useMe", () => ({
      useMe: () => ({
        email: null,
        authenticated: false,
        isLoading: false,
        error: new ApiError(500, null, "boom"),
        mutate: () => {},
      }),
    }));
    const { RequireAuth: RA } = await import("../lib/RequireAuth");
    const html = renderToStaticMarkup(
      React.createElement(RA, null, React.createElement("div", null, "x")),
    );
    // Tightened: exact visible-text match including the ellipsis-free
    // 'Failed to load session: boom' line. Catches a regression that
    // changes case, drops the prefix, or omits the message.
    expect(html).toContain("Failed to load session: boom");
  });

  test("renders children when session has an email", async () => {
    vi.doMock("../lib/useMe", () => ({
      useMe: () => ({
        email: "you@example.com",
        authenticated: true,
        isLoading: false,
        error: undefined,
        mutate: () => {},
      }),
    }));
    const { RequireAuth: RA } = await import("../lib/RequireAuth");
    const html = renderToStaticMarkup(
      React.createElement(
        RA,
        null,
        React.createElement("div", null, "secret-payload"),
      ),
    );
    expect(html).toContain("secret-payload");
  });
});
