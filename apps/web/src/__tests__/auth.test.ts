import { describe, expect, test } from "vitest";
import { CF_ACCESS_LOGOUT_URL } from "../lib/RequireAuth";

// `useMe is a function` and `RequireAuth is a function component` were
// removed: TS enforces export shape, and behavior is exercised by
// auth-render.test.ts which actually renders RequireAuth in every branch
// (loading / no-email / 401 / generic error / authenticated).

describe("CF_ACCESS_LOGOUT_URL", () => {
  test("points at the nocoo CF Access team", () => {
    expect(CF_ACCESS_LOGOUT_URL).toBe(
      "https://nocoo.cloudflareaccess.com/cdn-cgi/access/logout",
    );
  });

  test("uses the canonical /cdn-cgi/access/logout path", () => {
    expect(CF_ACCESS_LOGOUT_URL).toMatch(/\/cdn-cgi\/access\/logout$/);
  });
});
