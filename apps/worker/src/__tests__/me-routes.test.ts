import { describe, expect, test } from "vitest";
import { Hono } from "hono";
import { meRoutes } from "../routes/me";
import type { AppEnv } from "../lib/types";

// Direct unit test for meRoutes — bypasses accessAuth middleware so we
// can independently verify both branches of the `if (!email)` check
// in apps/worker/src/routes/me.ts. The integration path (accessAuth →
// meRoutes) is covered separately by routes.test.ts; this file pins
// the route's contract in isolation.

function mount(beforeMe?: (c: any) => void) {
  const app = new Hono<AppEnv>();
  if (beforeMe) {
    app.use("*", async (c, next) => {
      beforeMe(c);
      await next();
    });
  }
  app.route("/api/me", meRoutes);
  return app;
}

describe("meRoutes — direct", () => {
  test("returns 401 + {authenticated:false} when accessEmail unset (covers !email branch)", async () => {
    // Covers line 9 of me.ts (the 401 + authenticated:false path).
    // No middleware sets accessEmail → c.get('accessEmail') is undefined.
    const res = await mount().request("/api/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ authenticated: false });
  });

  test("returns 200 + {authenticated:true, email} when accessEmail set", async () => {
    // Documents the success path: a middleware that set accessEmail
    // (e.g. accessAuth's E2E_SKIP_AUTH bypass or verified JWT) makes
    // the route forward the email in the body.
    const res = await mount((c) => c.set("accessEmail", "alice@x.com")).request(
      "/api/me",
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      authenticated: true,
      email: "alice@x.com",
      name: null,
      avatar: null,
    });
  });

  test("forwards public name and avatar and drops extra author fields", async () => {
    const prev = globalThis.fetch;
    globalThis.fetch = Object.assign(
      async () =>
        new Response(
          JSON.stringify({
            name: "Zheng Li",
            avatar: "https://example.com/avatar-80.jpg",
            email: "secret@example.com",
            id: "hidden",
            slug: "zheng-li",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      { preconnect: () => {} },
    ) as typeof fetch;
    try {
      const res = await mount((c) =>
        c.set("accessEmail", "architie@gmail.com"),
      ).request("/api/me");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        authenticated: true,
        email: "architie@gmail.com",
        name: "Zheng Li",
        avatar: "https://example.com/avatar-80.jpg",
      });
    } finally {
      globalThis.fetch = prev;
    }
  });
});
