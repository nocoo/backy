import { describe, test, expect } from "bun:test";
import { isValidCidr, validateAllowedIps, normalizeAllowedIps, isIpAllowed, getClientIp } from "@/lib/ip";

describe("isValidCidr", () => {
  test("accepts plain IPv4 address", () => {
    expect(isValidCidr("1.2.3.4")).toBe(true);
    expect(isValidCidr("192.168.1.1")).toBe(true);
    expect(isValidCidr("0.0.0.0")).toBe(true);
    expect(isValidCidr("255.255.255.255")).toBe(true);
  });

  test("accepts valid CIDR notation", () => {
    expect(isValidCidr("1.2.3.4/8")).toBe(true);
    expect(isValidCidr("10.0.0.0/16")).toBe(true);
    expect(isValidCidr("192.168.0.0/24")).toBe(true);
    expect(isValidCidr("0.0.0.0/0")).toBe(true);
    expect(isValidCidr("255.255.255.255/32")).toBe(true);
  });

  test("trims whitespace", () => {
    expect(isValidCidr("  1.2.3.4/8  ")).toBe(true);
  });

  test("rejects invalid IP octets", () => {
    expect(isValidCidr("256.1.1.1")).toBe(false);
    expect(isValidCidr("1.2.3.999")).toBe(false);
  });

  test("rejects invalid prefix length", () => {
    expect(isValidCidr("1.2.3.4/33")).toBe(false);
    expect(isValidCidr("1.2.3.4/-1")).toBe(false);
    expect(isValidCidr("1.2.3.4/abc")).toBe(false);
    expect(isValidCidr("1.2.3.4/08")).toBe(false); // leading zero
  });

  test("rejects malformed input", () => {
    expect(isValidCidr("")).toBe(false);
    expect(isValidCidr("not-an-ip")).toBe(false);
    expect(isValidCidr("1.2.3")).toBe(false);
    expect(isValidCidr("1.2.3.4/8/16")).toBe(false);
    expect(isValidCidr("::1")).toBe(false); // IPv6 not supported
  });
});

describe("validateAllowedIps", () => {
  test("valid comma-separated list", () => {
    expect(validateAllowedIps("1.2.3.4/8, 10.0.0.0/16")).toEqual({ valid: true });
  });

  test("empty string is valid (allow all)", () => {
    expect(validateAllowedIps("")).toEqual({ valid: true });
    expect(validateAllowedIps("  ,  , ")).toEqual({ valid: true });
  });

  test("returns invalid entries", () => {
    const result = validateAllowedIps("1.2.3.4/8, bad, 999.0.0.0");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.invalid).toEqual(["bad", "999.0.0.0"]);
    }
  });
});

describe("normalizeAllowedIps", () => {
  test("trims and deduplicates", () => {
    expect(normalizeAllowedIps("  1.2.3.4/8 , 10.0.0.0/16,  1.2.3.4/8 ")).toBe("1.2.3.4/8,10.0.0.0/16");
  });

  test("returns null for empty", () => {
    expect(normalizeAllowedIps("")).toBeNull();
    expect(normalizeAllowedIps("  , , ")).toBeNull();
  });

  test("single entry", () => {
    expect(normalizeAllowedIps("192.168.0.0/24")).toBe("192.168.0.0/24");
  });
});

describe("isIpAllowed", () => {
  test("exact IP match (implicit /32)", () => {
    expect(isIpAllowed("1.2.3.4", "1.2.3.4")).toBe(true);
    expect(isIpAllowed("1.2.3.5", "1.2.3.4")).toBe(false);
  });

  test("CIDR /24 match", () => {
    expect(isIpAllowed("192.168.1.100", "192.168.1.0/24")).toBe(true);
    expect(isIpAllowed("192.168.1.255", "192.168.1.0/24")).toBe(true);
    expect(isIpAllowed("192.168.2.1", "192.168.1.0/24")).toBe(false);
  });

  test("CIDR /16 match", () => {
    expect(isIpAllowed("10.0.99.1", "10.0.0.0/16")).toBe(true);
    expect(isIpAllowed("10.1.0.1", "10.0.0.0/16")).toBe(false);
  });

  test("CIDR /8 match", () => {
    expect(isIpAllowed("10.255.255.255", "10.0.0.0/8")).toBe(true);
    expect(isIpAllowed("11.0.0.1", "10.0.0.0/8")).toBe(false);
  });

  test("/0 matches everything", () => {
    expect(isIpAllowed("1.2.3.4", "0.0.0.0/0")).toBe(true);
    expect(isIpAllowed("255.255.255.255", "0.0.0.0/0")).toBe(true);
  });

  test("/32 is exact match", () => {
    expect(isIpAllowed("10.0.0.1", "10.0.0.1/32")).toBe(true);
    expect(isIpAllowed("10.0.0.2", "10.0.0.1/32")).toBe(false);
  });

  test("multiple ranges — matches if any range matches", () => {
    const ranges = "192.168.1.0/24,10.0.0.0/8";
    expect(isIpAllowed("192.168.1.50", ranges)).toBe(true);
    expect(isIpAllowed("10.5.5.5", ranges)).toBe(true);
    expect(isIpAllowed("172.16.0.1", ranges)).toBe(false);
  });

  test("empty allowedIps string denies all (fail-closed)", () => {
    expect(isIpAllowed("1.2.3.4", "")).toBe(false);
    expect(isIpAllowed("1.2.3.4", "  ,  ")).toBe(false);
  });

  test("invalid client IP is rejected", () => {
    expect(isIpAllowed("not-an-ip", "10.0.0.0/8")).toBe(false);
    expect(isIpAllowed("", "10.0.0.0/8")).toBe(false);
  });

  test("handles high-octet IPs correctly (no sign issues)", () => {
    expect(isIpAllowed("200.100.50.25", "200.100.50.0/24")).toBe(true);
    expect(isIpAllowed("255.255.255.254", "255.255.255.0/24")).toBe(true);
  });

  test("skips invalid CIDR entries but matches valid ones", () => {
    expect(isIpAllowed("10.0.0.1", "bad,10.0.0.0/8")).toBe(true);
    expect(isIpAllowed("10.0.0.1", "bad,999.0.0.0")).toBe(false);
  });

  test("boundary IP just outside CIDR range is rejected", () => {
    // 192.168.1.0/24 covers 192.168.1.0–192.168.1.255
    expect(isIpAllowed("192.168.0.255", "192.168.1.0/24")).toBe(false);
    expect(isIpAllowed("192.168.2.0", "192.168.1.0/24")).toBe(false);
    // Just inside
    expect(isIpAllowed("192.168.1.0", "192.168.1.0/24")).toBe(true);
    expect(isIpAllowed("192.168.1.255", "192.168.1.0/24")).toBe(true);
  });
});

describe("getClientIp", () => {
  test("extracts rightmost IP from x-forwarded-for", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIp(req)).toBe("5.6.7.8");
  });

  test("extracts single IP from x-forwarded-for", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "10.0.0.1" },
    });
    expect(getClientIp(req)).toBe("10.0.0.1");
  });

  test("returns null when no x-forwarded-for header", () => {
    const req = new Request("http://localhost");
    expect(getClientIp(req)).toBeNull();
  });

  test("returns null for empty x-forwarded-for", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "" },
    });
    expect(getClientIp(req)).toBeNull();
  });

  test("prefers x-envoy-external-address over x-forwarded-for", () => {
    const req = new Request("http://localhost", {
      headers: {
        "x-envoy-external-address": "99.99.99.99",
        "x-forwarded-for": "1.2.3.4, 5.6.7.8",
      },
    });
    expect(getClientIp(req)).toBe("99.99.99.99");
  });

  test("strips ::ffff: IPv6-mapped prefix", () => {
    const req = new Request("http://localhost", {
      headers: { "x-envoy-external-address": "::ffff:10.0.0.1" },
    });
    expect(getClientIp(req)).toBe("10.0.0.1");
  });

  test("strips ::ffff: prefix from x-forwarded-for", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "::ffff:192.168.1.1" },
    });
    expect(getClientIp(req)).toBe("192.168.1.1");
  });
});
