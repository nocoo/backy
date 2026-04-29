/**
 * L2: Live/IP-info/Me API E2E tests.
 *
 * Routes covered:
 *   GET /api/live
 *   GET /api/ip-info
 *   GET /api/me
 */

import { describe, expect, test } from "bun:test";
import { url } from "./config";

describe("L2: API /api/live", () => {
  test("GET /api/live returns ok with dependencies up", async () => {
    const res = await fetch(url("/api/live"));
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      status: string;
      version: string;
      uptime_s: number;
      dependencies?: {
        d1?: { status: string };
        r2?: { status: string };
      };
    };
    expect(body.status).toBe("ok");
    expect(body.dependencies?.d1?.status).toBe("up");
    expect(body.dependencies?.r2?.status).toBe("up");
    expect(typeof body.version).toBe("string");
    expect(typeof body.uptime_s).toBe("number");
  });
});

describe("L2: API /api/ip-info", () => {
  test("GET /api/ip-info returns response", async () => {
    const res = await fetch(url("/api/ip-info"));
    // 200 = success (ECHO_API_URL configured)
    // 503 = IP info service not configured (test env without ECHO_API_URL)
    expect([200, 503]).toContain(res.status);

    if (res.status === 200) {
      const body = (await res.json()) as { ip: string };
      expect(body).toHaveProperty("ip");
    } else {
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("IP info service not configured");
    }
  });
});

describe("L2: API /api/me", () => {
  test("GET /api/me returns authenticated user", async () => {
    const res = await fetch(url("/api/me"));
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      authenticated: boolean;
      email: string;
    };
    expect(body.authenticated).toBe(true);
    expect(typeof body.email).toBe("string");
  });
});
