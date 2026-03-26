import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { buildBaseUrl, ALLOWED_HOSTS } from "@/lib/hosts";

describe("ALLOWED_HOSTS", () => {
  test("contains default allowed hosts", () => {
    expect(ALLOWED_HOSTS.has("backy.hexly.ai")).toBe(true);
    expect(ALLOWED_HOSTS.has("localhost:7026")).toBe(true);
  });

  test("does not contain arbitrary hosts", () => {
    expect(ALLOWED_HOSTS.has("evil.com")).toBe(false);
    expect(ALLOWED_HOSTS.has("localhost:9999")).toBe(false);
  });
});

describe("buildBaseUrl", () => {
  let savedAllowedHosts: string | undefined;

  beforeEach(() => {
    savedAllowedHosts = process.env.ALLOWED_HOSTS;
  });

  afterEach(() => {
    if (savedAllowedHosts === undefined) {
      delete process.env.ALLOWED_HOSTS;
    } else {
      process.env.ALLOWED_HOSTS = savedAllowedHosts;
    }
  });

  test("returns request origin when no x-forwarded-host", () => {
    const req = new Request("https://localhost:7026/api/projects/1/prompt");
    expect(buildBaseUrl(req)).toBe("https://localhost:7026");
  });

  test("uses forwarded host when in ALLOWED_HOSTS", () => {
    const req = new Request("http://localhost:7026/api/projects/1/prompt", {
      headers: {
        "x-forwarded-host": "backy.hexly.ai",
        "x-forwarded-proto": "https",
      },
    });
    expect(buildBaseUrl(req)).toBe("https://backy.hexly.ai");
  });

  test("ignores forwarded host NOT in ALLOWED_HOSTS (host injection defense)", () => {
    const req = new Request("http://localhost:7026/api/projects/1/prompt", {
      headers: {
        "x-forwarded-host": "evil.com",
        "x-forwarded-proto": "https",
      },
    });
    // Falls back to request origin, does NOT use evil.com
    expect(buildBaseUrl(req)).toBe("http://localhost:7026");
  });

  test("defaults x-forwarded-proto to https when missing", () => {
    const req = new Request("http://localhost:7026/api/projects/1/prompt", {
      headers: {
        "x-forwarded-host": "backy.hexly.ai",
      },
    });
    expect(buildBaseUrl(req)).toBe("https://backy.hexly.ai");
  });

  test("handles http protocol in x-forwarded-proto", () => {
    const req = new Request("http://localhost:7026/api/projects/1/prompt", {
      headers: {
        "x-forwarded-host": "localhost:7026",
        "x-forwarded-proto": "http",
      },
    });
    expect(buildBaseUrl(req)).toBe("http://localhost:7026");
  });
});
