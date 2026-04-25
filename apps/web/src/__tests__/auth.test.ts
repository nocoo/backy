import { describe, expect, test } from "vitest";
import { useMe } from "../lib/useMe";
import { RequireAuth, CF_ACCESS_LOGOUT_URL } from "../lib/RequireAuth";

describe("useMe / RequireAuth surface", () => {
  test("useMe is a function", () => {
    expect(typeof useMe).toBe("function");
  });

  test("RequireAuth is a function component", () => {
    expect(typeof RequireAuth).toBe("function");
  });

  test("CF_ACCESS_LOGOUT_URL points at nocoo team", () => {
    expect(CF_ACCESS_LOGOUT_URL).toBe(
      "https://nocoo.cloudflareaccess.com/cdn-cgi/access/logout",
    );
  });
});
