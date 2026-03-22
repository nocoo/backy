import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { isUrlSafe, isPrivateIp, isPrivateIpv6, resolveAndValidateUrl } from "@/lib/url";

describe("isUrlSafe", () => {
  let originalAllowlist: string | undefined;

  beforeEach(() => {
    originalAllowlist = process.env.SSRF_ALLOWLIST;
    delete process.env.SSRF_ALLOWLIST;
  });

  afterEach(() => {
    if (originalAllowlist === undefined) {
      delete process.env.SSRF_ALLOWLIST;
    } else {
      process.env.SSRF_ALLOWLIST = originalAllowlist;
    }
  });

  // --- Allowed URLs ---

  test("allows valid HTTPS URL", () => {
    expect(isUrlSafe("https://example.com/webhook")).toBe(true);
  });

  test("allows HTTPS URL with port", () => {
    expect(isUrlSafe("https://example.com:8443/hook")).toBe(true);
  });

  test("allows HTTPS URL with path and query", () => {
    expect(isUrlSafe("https://api.saas.com/v1/backup?key=123")).toBe(true);
  });

  test("allows public IP over HTTPS", () => {
    expect(isUrlSafe("https://8.8.8.8/webhook")).toBe(true);
  });

  // --- Blocked: non-HTTPS ---

  test("blocks HTTP URL", () => {
    expect(isUrlSafe("http://example.com/webhook")).toBe(false);
  });

  test("blocks FTP URL", () => {
    expect(isUrlSafe("ftp://example.com/file")).toBe(false);
  });

  test("blocks file:// URL", () => {
    expect(isUrlSafe("file:///etc/passwd")).toBe(false);
  });

  // --- Blocked: unparseable ---

  test("blocks empty string", () => {
    expect(isUrlSafe("")).toBe(false);
  });

  test("blocks garbage string", () => {
    expect(isUrlSafe("not-a-url")).toBe(false);
  });

  // --- Blocked: hostnames ---

  test("blocks localhost", () => {
    expect(isUrlSafe("https://localhost/webhook")).toBe(false);
  });

  test("blocks localhost with port", () => {
    expect(isUrlSafe("https://localhost:3000/hook")).toBe(false);
  });

  test("blocks metadata.google.internal", () => {
    expect(isUrlSafe("https://metadata.google.internal/computeMetadata/v1/")).toBe(false);
  });

  test("blocks metadata.goog", () => {
    expect(isUrlSafe("https://metadata.goog/computeMetadata/v1/")).toBe(false);
  });

  // --- Blocked: hostname suffixes ---

  test("blocks .internal suffix", () => {
    expect(isUrlSafe("https://service.internal/api")).toBe(false);
  });

  test("blocks .local suffix", () => {
    expect(isUrlSafe("https://myapp.local/backup")).toBe(false);
  });

  test("blocks .localhost suffix", () => {
    expect(isUrlSafe("https://app.localhost/hook")).toBe(false);
  });

  // --- Blocked: private IPv4 ranges ---

  test("blocks 127.0.0.1 (loopback)", () => {
    expect(isUrlSafe("https://127.0.0.1/hook")).toBe(false);
  });

  test("blocks 127.0.0.255 (loopback range)", () => {
    expect(isUrlSafe("https://127.0.0.255/hook")).toBe(false);
  });

  test("blocks 10.0.0.1 (private class A)", () => {
    expect(isUrlSafe("https://10.0.0.1/hook")).toBe(false);
  });

  test("blocks 172.16.0.1 (private class B)", () => {
    expect(isUrlSafe("https://172.16.0.1/hook")).toBe(false);
  });

  test("blocks 172.31.255.255 (private class B upper)", () => {
    expect(isUrlSafe("https://172.31.255.255/hook")).toBe(false);
  });

  test("allows 172.32.0.1 (outside private class B)", () => {
    expect(isUrlSafe("https://172.32.0.1/hook")).toBe(true);
  });

  test("blocks 192.168.1.1 (private class C)", () => {
    expect(isUrlSafe("https://192.168.1.1/hook")).toBe(false);
  });

  test("blocks 169.254.169.254 (link-local / cloud metadata)", () => {
    expect(isUrlSafe("https://169.254.169.254/latest/meta-data/")).toBe(false);
  });

  test("blocks 0.0.0.0", () => {
    expect(isUrlSafe("https://0.0.0.0/hook")).toBe(false);
  });

  // --- Blocked: IPv6 ---

  test("blocks [::1] IPv6 loopback", () => {
    expect(isUrlSafe("https://[::1]/hook")).toBe(false);
  });

  test("blocks [fe80::1] IPv6 link-local", () => {
    expect(isUrlSafe("https://[fe80::1]/hook")).toBe(false);
  });

  test("blocks [fc00::1] IPv6 ULA", () => {
    expect(isUrlSafe("https://[fc00::1]/hook")).toBe(false);
  });

  test("blocks [fd12:3456::1] IPv6 ULA (fd prefix)", () => {
    expect(isUrlSafe("https://[fd12:3456::1]/hook")).toBe(false);
  });

  test("blocks [::ffff:127.0.0.1] IPv4-mapped loopback", () => {
    expect(isUrlSafe("https://[::ffff:127.0.0.1]/hook")).toBe(false);
  });

  test("blocks [::ffff:169.254.169.254] IPv4-mapped metadata", () => {
    expect(isUrlSafe("https://[::ffff:169.254.169.254]/hook")).toBe(false);
  });

  test("allows [2607:f8b0::1] public IPv6", () => {
    expect(isUrlSafe("https://[2607:f8b0::1]/hook")).toBe(true);
  });

  // --- SSRF_ALLOWLIST bypass ---

  test("allowlist bypasses all checks for matching origin", () => {
    process.env.SSRF_ALLOWLIST = "http://localhost:17026";
    expect(isUrlSafe("http://localhost:17026/api/db/init")).toBe(true);
  });

  test("allowlist does not bypass non-matching URLs", () => {
    process.env.SSRF_ALLOWLIST = "http://localhost:17026";
    expect(isUrlSafe("http://localhost:9999/evil")).toBe(false);
  });

  test("allowlist supports multiple entries", () => {
    process.env.SSRF_ALLOWLIST = "http://localhost:17026,https://test.internal";
    expect(isUrlSafe("https://test.internal/hook")).toBe(true);
    expect(isUrlSafe("http://localhost:17026/api")).toBe(true);
  });

  test("allowlist rejects crafted hostname that shares prefix string", () => {
    // With ONLY the allowlist and a normally-blocked URL scheme (http://),
    // verify that a crafted hostname doesn't slip through the allowlist
    process.env.SSRF_ALLOWLIST = "http://api.example.com";
    // This would pass a naive startsWith("http://api.example.com") check
    // but has a different hostname — should NOT be allowlisted
    expect(isUrlSafe("http://api.example.com.evil.tld/hook")).toBe(false);
  });

  test("allowlist matches by origin, not path prefix", () => {
    process.env.SSRF_ALLOWLIST = "https://api.example.com/v1";
    // Same origin, different path — should still match (origin-level allowlist)
    expect(isUrlSafe("https://api.example.com/v2/other")).toBe(true);
  });
});

describe("isPrivateIp", () => {
  test("identifies loopback addresses", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("127.255.255.255")).toBe(true);
  });

  test("identifies private class A", () => {
    expect(isPrivateIp("10.0.0.1")).toBe(true);
    expect(isPrivateIp("10.255.255.255")).toBe(true);
  });

  test("identifies private class B", () => {
    expect(isPrivateIp("172.16.0.1")).toBe(true);
    expect(isPrivateIp("172.31.255.255")).toBe(true);
  });

  test("identifies private class C", () => {
    expect(isPrivateIp("192.168.0.1")).toBe(true);
    expect(isPrivateIp("192.168.255.255")).toBe(true);
  });

  test("identifies link-local", () => {
    expect(isPrivateIp("169.254.169.254")).toBe(true);
  });

  test("rejects public IPs", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("1.1.1.1")).toBe(false);
    expect(isPrivateIp("172.32.0.1")).toBe(false);
  });

  test("returns false for non-IP strings", () => {
    expect(isPrivateIp("example.com")).toBe(false);
    expect(isPrivateIp("not-an-ip")).toBe(false);
  });
});

describe("isPrivateIpv6", () => {
  test("identifies loopback ::1", () => {
    expect(isPrivateIpv6("::1")).toBe(true);
    expect(isPrivateIpv6("[::1]")).toBe(true);
  });

  test("identifies unspecified ::", () => {
    expect(isPrivateIpv6("::")).toBe(true);
  });

  test("identifies link-local fe80::", () => {
    expect(isPrivateIpv6("fe80::1")).toBe(true);
    expect(isPrivateIpv6("fe80::abcd:1234")).toBe(true);
    expect(isPrivateIpv6("[fe80::1]")).toBe(true);
  });

  test("identifies ULA fc00::/7 (fc00:: and fd00::)", () => {
    expect(isPrivateIpv6("fc00::1")).toBe(true);
    expect(isPrivateIpv6("fd00::1")).toBe(true);
    expect(isPrivateIpv6("fd12:3456:789a::1")).toBe(true);
  });

  test("identifies IPv4-mapped private addresses", () => {
    expect(isPrivateIpv6("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIpv6("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateIpv6("::ffff:192.168.1.1")).toBe(true);
    expect(isPrivateIpv6("::ffff:169.254.169.254")).toBe(true);
  });

  test("allows IPv4-mapped public addresses", () => {
    expect(isPrivateIpv6("::ffff:8.8.8.8")).toBe(false);
  });

  test("rejects public IPv6 addresses", () => {
    expect(isPrivateIpv6("2607:f8b0:4004:800::200e")).toBe(false);
    expect(isPrivateIpv6("2001:4860:4860::8888")).toBe(false);
  });

  test("returns false for non-IPv6 strings", () => {
    expect(isPrivateIpv6("example.com")).toBe(false);
    expect(isPrivateIpv6("127.0.0.1")).toBe(false);
    expect(isPrivateIpv6("not-an-ip")).toBe(false);
  });

  test("handles URL-parsed bracketed IPv4-mapped (hex form)", () => {
    // URL parser converts [::ffff:127.0.0.1] to [::ffff:7f00:1]
    expect(isPrivateIpv6("[::ffff:7f00:1]")).toBe(true);
    // URL parser converts [::ffff:169.254.169.254] to [::ffff:a9fe:a9fe]
    expect(isPrivateIpv6("[::ffff:a9fe:a9fe]")).toBe(true);
    // Public: 8.8.8.8 → ::ffff:808:808
    expect(isPrivateIpv6("[::ffff:808:808]")).toBe(false);
  });
});

describe("resolveAndValidateUrl", () => {
  let originalAllowlist: string | undefined;

  beforeEach(() => {
    originalAllowlist = process.env.SSRF_ALLOWLIST;
    delete process.env.SSRF_ALLOWLIST;
  });

  afterEach(() => {
    if (originalAllowlist === undefined) {
      delete process.env.SSRF_ALLOWLIST;
    } else {
      process.env.SSRF_ALLOWLIST = originalAllowlist;
    }
  });

  test("allows URL with public DNS resolution (example.com)", async () => {
    // example.com is a well-known domain that resolves to public IPs
    const result = await resolveAndValidateUrl("https://example.com/hook");
    expect(result.safe).toBe(true);
  }, 15_000);

  test("blocks IP address in private range directly", async () => {
    const result = await resolveAndValidateUrl("https://127.0.0.1/hook");
    expect(result.safe).toBe(false);
    expect((result as { reason: string }).reason).toContain("private");
  });

  test("blocks 169.254.169.254 (cloud metadata IP)", async () => {
    const result = await resolveAndValidateUrl("https://169.254.169.254/latest");
    expect(result.safe).toBe(false);
  });

  test("rejects invalid URL", async () => {
    const result = await resolveAndValidateUrl("not-a-url");
    expect(result.safe).toBe(false);
    expect((result as { reason: string }).reason).toContain("Invalid URL");
  });

  test("blocks hostname that fails DNS resolution", async () => {
    const result = await resolveAndValidateUrl("https://this-domain-does-not-exist-xyzzy.example/hook");
    expect(result.safe).toBe(false);
    expect((result as { reason: string }).reason).toContain("DNS resolution failed");
  }, 15_000);

  test("allowlist bypasses DNS check", async () => {
    process.env.SSRF_ALLOWLIST = "http://localhost:17026";
    const result = await resolveAndValidateUrl("http://localhost:17026/api/test");
    expect(result.safe).toBe(true);
  });

  test("blocks domain resolving to loopback (localhost)", async () => {
    // localhost resolves to 127.0.0.1 on most systems
    const result = await resolveAndValidateUrl("https://localhost/hook");
    expect(result.safe).toBe(false);
  }, 15_000);

  test("blocks IPv6 loopback literal directly", async () => {
    const result = await resolveAndValidateUrl("https://[::1]/hook");
    expect(result.safe).toBe(false);
    expect((result as { reason: string }).reason).toContain("private");
  });

  test("blocks IPv6 link-local literal directly", async () => {
    const result = await resolveAndValidateUrl("https://[fe80::1]/hook");
    expect(result.safe).toBe(false);
    expect((result as { reason: string }).reason).toContain("private");
  });

  test("blocks IPv6 ULA literal directly", async () => {
    const result = await resolveAndValidateUrl("https://[fd00::1]/hook");
    expect(result.safe).toBe(false);
    expect((result as { reason: string }).reason).toContain("private");
  });
});
