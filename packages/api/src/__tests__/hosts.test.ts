import { describe, expect, test } from "vitest";
import {
  buildBaseUrl,
  isAllowedHost,
  parseAllowedHosts,
} from "@backy/api/hosts";

const TEST_HOSTS = "example.com,backy.hexly.ai,localhost:7017";
const env = { ALLOWED_HOSTS: TEST_HOSTS };

describe("ALLOWED_HOSTS", () => {
  test("contains expected hosts from env", () => {
    const allowedHosts = parseAllowedHosts(env);
    // Tightened: pin the FULL parsed Set instead of 2 of 3 spot checks.
    // Catches: a regression that drops a host, a parser change that
    // doesn't trim whitespace, OR a regression that smuggles in extra
    // hosts. Sorted toEqual via [...].sort() is determinism-safe across
    // V8 Set iteration order.
    expect([...allowedHosts].sort()).toEqual([
      "backy.hexly.ai",
      "example.com",
      "localhost:7017",
    ]);
  });

  test("does not contain arbitrary hosts", () => {
    expect(isAllowedHost(env, "evil.com")).toBe(false);
    expect(isAllowedHost(env, "localhost:9999")).toBe(false);
    // Positively confirm the listed hosts ARE allowed (was implicit
    // — a regression that broke isAllowedHost would not surface here).
    expect(isAllowedHost(env, "example.com")).toBe(true);
    expect(isAllowedHost(env, "backy.hexly.ai")).toBe(true);
    expect(isAllowedHost(env, "localhost:7017")).toBe(true);
  });

  test("returns false when maybeHost is omitted (covers ?? '' fallback)", () => {
    // Covers line 32 of lib/hosts.ts: `parseAllowedHosts(envOrHost).has(maybeHost ?? '')`.
    // The empty string is not in any allowlist (the parser .filter(Boolean)s
    // it out), so omitting maybeHost MUST return false. Documents the
    // contract: callers can't accidentally bypass the check by
    // forgetting to pass the host arg.
    expect(isAllowedHost(env)).toBe(false);
  });

  test("string-overload uses default ALLOWED_HOSTS env (covers typeof-string branch)", () => {
    // Covers the `if (typeof envOrHost === 'string')` branch of
    // isAllowedHost — the string-only overload that re-parses the
    // default ALLOWED_HOSTS env (process.env-derived, here empty so
    // parseAllowedHosts() falls back to its 'localhost:7017' default).
    // Existing tests all pass `(env, host)`; the single-arg string
    // overload was unreached.
    expect(isAllowedHost("localhost:7017")).toBe(true);
    expect(isAllowedHost("evil.com")).toBe(false);
  });
});

describe("buildBaseUrl", () => {
  test("returns request origin when no x-forwarded-host", () => {
    const req = new Request("https://localhost:7017/api/projects/1/prompt");
    expect(buildBaseUrl(req, env)).toBe("https://localhost:7017");
  });

  test("uses forwarded host when in ALLOWED_HOSTS", () => {
    const req = new Request("http://localhost:7017/api/projects/1/prompt", {
      headers: {
        "x-forwarded-host": "backy.hexly.ai",
        "x-forwarded-proto": "https",
      },
    });
    expect(buildBaseUrl(req, env)).toBe("https://backy.hexly.ai");
  });

  test("ignores forwarded host NOT in ALLOWED_HOSTS (host injection defense)", () => {
    const req = new Request("http://localhost:7017/api/projects/1/prompt", {
      headers: {
        "x-forwarded-host": "evil.com",
        "x-forwarded-proto": "https",
      },
    });
    // Falls back to request origin, does NOT use evil.com
    expect(buildBaseUrl(req, env)).toBe("http://localhost:7017");
  });

  test("defaults x-forwarded-proto to https when missing", () => {
    const req = new Request("http://localhost:7017/api/projects/1/prompt", {
      headers: {
        "x-forwarded-host": "backy.hexly.ai",
      },
    });
    expect(buildBaseUrl(req, env)).toBe("https://backy.hexly.ai");
  });

  test("handles http protocol in x-forwarded-proto", () => {
    const req = new Request("http://localhost:7017/api/projects/1/prompt", {
      headers: {
        "x-forwarded-host": "localhost:7017",
        "x-forwarded-proto": "http",
      },
    });
    expect(buildBaseUrl(req, env)).toBe("http://localhost:7017");
  });
});
