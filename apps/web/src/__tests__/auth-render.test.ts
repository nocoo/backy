// Minimal DOM-rendering tests for the auth/session shim.
// Avoids `mock.module` (which is global per Bun) — stubs `globalThis.fetch`
// instead so the real api/swrFetcher path is exercised end-to-end.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const originalFetch = globalThis.fetch;

beforeAll(() => {
  const win = new Window();
  // @ts-expect-error happy-dom Window mostly matches DOM Window but isn't a perfect type match.
  globalThis.window = win;
  // @ts-expect-error happy-dom Document mostly matches DOM Document but isn't a perfect type match.
  globalThis.document = win.document;
  // @ts-expect-error happy-dom Navigator mostly matches DOM Navigator but isn't a perfect type match.
  globalThis.navigator = win.navigator;

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

const { useMe } = await import("../lib/useMe");
const { RequireAuth, CF_ACCESS_LOGOUT_URL } = await import(
  "../lib/RequireAuth"
);
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
    expect(snapshot!.email).toBeNull();
    expect(snapshot!.authenticated).toBe(false);
    expect(typeof snapshot!.mutate).toBe("function");
    expect(snapshot!.isLoading).toBe(true);
  });
});

describe("RequireAuth", () => {
  test("renders the loading shim while session is undetermined", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        RequireAuth,
        null,
        React.createElement("div", null, "secret"),
      ),
    );
    expect(html.toLowerCase()).toContain("loading");
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
});
