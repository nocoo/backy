import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { isUrlSafe } from "@/lib/url";

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

  // --- SSRF_ALLOWLIST bypass ---

  test("allowlist bypasses all checks for matching prefix", () => {
    process.env.SSRF_ALLOWLIST = "http://localhost:17026";
    expect(isUrlSafe("http://localhost:17026/api/db/init")).toBe(true);
  });

  test("allowlist does not bypass non-matching URLs", () => {
    process.env.SSRF_ALLOWLIST = "http://localhost:17026";
    expect(isUrlSafe("http://localhost:9999/evil")).toBe(false);
  });

  test("allowlist supports multiple prefixes", () => {
    process.env.SSRF_ALLOWLIST = "http://localhost:17026,https://test.internal";
    expect(isUrlSafe("https://test.internal/hook")).toBe(true);
    expect(isUrlSafe("http://localhost:17026/api")).toBe(true);
  });
});
