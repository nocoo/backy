import { describe, expect, test } from "bun:test";

// Set up environment BEFORE importing the module
const TEST_HOSTS = "example.com,backy.hexly.ai,localhost:7017";
process.env.ALLOWED_HOSTS = TEST_HOSTS;

// Re-import to pick up the env var (Bun evaluates at import time)
const { buildBaseUrl, ALLOWED_HOSTS } = await import("@/lib/hosts");

describe("ALLOWED_HOSTS", () => {
  test("contains expected hosts from env", () => {
    expect(ALLOWED_HOSTS.has("example.com")).toBe(true);
    expect(ALLOWED_HOSTS.has("localhost:7017")).toBe(true);
  });

  test("does not contain arbitrary hosts", () => {
    expect(ALLOWED_HOSTS.has("evil.com")).toBe(false);
    expect(ALLOWED_HOSTS.has("localhost:9999")).toBe(false);
  });
});

describe("buildBaseUrl", () => {
  test("returns request origin when no x-forwarded-host", () => {
    const req = new Request("https://localhost:7017/api/projects/1/prompt");
    expect(buildBaseUrl(req)).toBe("https://localhost:7017");
  });

  test("uses forwarded host when in ALLOWED_HOSTS", () => {
    const req = new Request("http://localhost:7017/api/projects/1/prompt", {
      headers: {
        "x-forwarded-host": "backy.hexly.ai",
        "x-forwarded-proto": "https",
      },
    });
    expect(buildBaseUrl(req)).toBe("https://backy.hexly.ai");
  });

  test("ignores forwarded host NOT in ALLOWED_HOSTS (host injection defense)", () => {
    const req = new Request("http://localhost:7017/api/projects/1/prompt", {
      headers: {
        "x-forwarded-host": "evil.com",
        "x-forwarded-proto": "https",
      },
    });
    // Falls back to request origin, does NOT use evil.com
    expect(buildBaseUrl(req)).toBe("http://localhost:7017");
  });

  test("defaults x-forwarded-proto to https when missing", () => {
    const req = new Request("http://localhost:7017/api/projects/1/prompt", {
      headers: {
        "x-forwarded-host": "backy.hexly.ai",
      },
    });
    expect(buildBaseUrl(req)).toBe("https://backy.hexly.ai");
  });

  test("handles http protocol in x-forwarded-proto", () => {
    const req = new Request("http://localhost:7017/api/projects/1/prompt", {
      headers: {
        "x-forwarded-host": "localhost:7017",
        "x-forwarded-proto": "http",
      },
    });
    expect(buildBaseUrl(req)).toBe("http://localhost:7017");
  });
});
