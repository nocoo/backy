/**
 * SSRF protection for webhook URLs.
 *
 * Validates that a URL is safe to fetch server-side by blocking:
 *   - Non-HTTPS schemes
 *   - Localhost and internal hostnames
 *   - Private/reserved IPv4 ranges
 *   - IPv6 loopback
 *
 * An optional SSRF_ALLOWLIST env var (comma-separated URL prefixes)
 * can bypass all checks — used for E2E testing with localhost.
 */

import { ipToInt } from "@/lib/ip";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
]);

const BLOCKED_HOSTNAME_SUFFIXES = [
  ".internal",
  ".local",
  ".localhost",
];

/**
 * Private/reserved IPv4 CIDR ranges to block.
 * Each entry is [networkInt, mask].
 */
const BLOCKED_CIDRS: Array<[number, number]> = [
  cidr("127.0.0.0", 8),    // loopback
  cidr("10.0.0.0", 8),     // private class A
  cidr("172.16.0.0", 12),  // private class B
  cidr("192.168.0.0", 16), // private class C
  cidr("169.254.0.0", 16), // link-local
  cidr("0.0.0.0", 8),      // "this" network
];

function cidr(ip: string, prefix: number): [number, number] {
  const n = ipToInt(ip);
  if (n === null) throw new Error(`Invalid CIDR base: ${ip}`);
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return [n & mask, mask];
}

function isPrivateIp(hostname: string): boolean {
  const ip = ipToInt(hostname);
  if (ip === null) return false;
  return BLOCKED_CIDRS.some(([network, mask]) => (ip & mask) === network);
}

/**
 * Check whether a URL is safe to fetch server-side.
 *
 * Returns true if the URL passes all SSRF checks, false otherwise.
 */
export function isUrlSafe(url: string): boolean {
  // Check SSRF_ALLOWLIST bypass first
  const allowlist = process.env.SSRF_ALLOWLIST;
  if (allowlist) {
    const prefixes = allowlist.split(",").map((s) => s.trim()).filter(Boolean);
    if (prefixes.some((prefix) => url.startsWith(prefix))) {
      return true;
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // Must be HTTPS
  if (parsed.protocol !== "https:") {
    return false;
  }

  const hostname = parsed.hostname;

  // Check blocked hostnames
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return false;
  }

  // Check blocked hostname suffixes
  if (BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return false;
  }

  // Check IPv6 loopback
  if (hostname === "::1" || hostname === "[::1]") {
    return false;
  }

  // Check blocked IPv4 ranges (handles numeric hostnames like 127.0.0.1)
  if (isPrivateIp(hostname)) {
    return false;
  }

  return true;
}
