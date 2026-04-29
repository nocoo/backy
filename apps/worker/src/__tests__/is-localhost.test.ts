import { describe, expect, test } from "vitest";
import { Hono } from "hono";
import { isLocalhost } from "../middleware/is-localhost";
import type { AppEnv } from "../lib/types";

function appThatProbes() {
  const app = new Hono<AppEnv>();
  app.get("/probe", (c) => c.json({ local: isLocalhost(c) }));
  return app;
}

describe("isLocalhost", () => {
  test("true for localhost host without cf metadata", async () => {
    const res = await appThatProbes().request("/probe", {
      headers: { host: "localhost:7018" },
    });
    expect((await res.json()) as unknown).toEqual({ local: true });
  });

  test("true for 127.0.0.1 host", async () => {
    const res = await appThatProbes().request("/probe", {
      headers: { host: "127.0.0.1:7018" },
    });
    expect((await res.json()) as unknown).toEqual({ local: true });
  });

  test("BUG: 'localhost.evil.com' attacker-controlled host is treated as local", async () => {
    // Discovery: isLocalhost uses startsWith("localhost") and
    // startsWith("127.0.0.1"), so a malicious Host header like
    // 'localhost.evil.com' (or '127.0.0.1.evil.com') would bypass
    // CF Access. The cf-edge check (`c.req.raw.cf`) protects against
    // this on the CF edge in practice, but if a non-CF deploy ever
    // routes traffic to this worker, the bypass is open. This test
    // pins the CURRENT (vulnerable) behavior so a fix to use exact-
    // match-or-colon-suffix would intentionally break it. Logged in
    // ideas.md.
    const res = await appThatProbes().request("/probe", {
      headers: { host: "localhost.evil.com" },
    });
    expect((await res.json()) as unknown).toEqual({ local: true });
  });

  test("false for production host", async () => {
    const res = await appThatProbes().request("/probe", {
      headers: { host: "backy.example.com" },
    });
    expect((await res.json()) as unknown).toEqual({ local: false });
  });

  test("false when on CF edge regardless of host header", async () => {
    const app = new Hono<AppEnv>();
    app.get("/probe", (c) => {
      // Spoof cf metadata to mimic CF edge.
      Object.defineProperty(c.req.raw, "cf", {
        value: { country: "US" },
        configurable: true,
      });
      return c.json({ local: isLocalhost(c) });
    });
    const res = await app.request("/probe", {
      headers: { host: "localhost:7018" },
    });
    expect((await res.json()) as unknown).toEqual({ local: false });
  });

  test("missing host header treated as non-local", async () => {
    const app = new Hono<AppEnv>();
    app.get("/probe", (c) => {
      // Simulate a Request whose Host header is absent — Hono fills `host`
      // from the URL, so we override the helper output via a separate path.
      const synthetic: { req: { header(): undefined; raw: Request } } = {
        req: {
          header: () => undefined,
          raw: new Request("http://x"),
        },
      };
      return c.json({
        local: isLocalhost(synthetic as unknown as Parameters<typeof isLocalhost>[0]),
      });
    });
    const res = await app.request("/probe");
    expect((await res.json()) as unknown).toEqual({ local: false });
  });
});
