import { describe, test, expect } from "bun:test";
import { isValidCidr, validateAllowedIps, normalizeAllowedIps } from "@/lib/ip";

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
