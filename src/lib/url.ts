/**
 * SSRF protection for webhook URLs.
 *
 * Two layers of defense:
 *   1. `isUrlSafe(url)` — synchronous, checks URL string against blocklists.
 *      Used at save-time (project PUT) for fast validation.
 *   2. `resolveAndValidateUrl(url)` — async, performs DNS resolution and
 *      checks all resolved IPs against private ranges. Used at fetch-time
 *      (cron trigger) to block DNS rebinding attacks where a public domain
 *      resolves to a private IP.
 *
 * An optional SSRF_ALLOWLIST env var (comma-separated URL prefixes)
 * can bypass all checks — used for E2E testing with localhost.
 */

import { resolve4 } from "node:dns/promises";
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

/**
 * Check if an IPv4 address falls within any blocked CIDR range.
 * Exported for use by resolveAndValidateUrl and tests.
 */
export function isPrivateIp(ip: string): boolean {
  const ipInt = ipToInt(ip);
  if (ipInt === null) return false;
  return BLOCKED_CIDRS.some(([network, mask]) => (ipInt & mask) === network);
}

/**
 * Check if the URL matches the SSRF_ALLOWLIST.
 * Returns true if the URL is allowlisted (bypasses all SSRF checks).
 */
function isAllowlisted(url: string): boolean {
  const allowlist = process.env.SSRF_ALLOWLIST;
  if (!allowlist) return false;
  const prefixes = allowlist.split(",").map((s) => s.trim()).filter(Boolean);
  return prefixes.some((prefix) => url.startsWith(prefix));
}

/**
 * Check whether a URL is safe to fetch server-side (synchronous, string-only).
 *
 * This catches obvious SSRF attempts (private IPs, internal hostnames, non-HTTPS)
 * but does NOT perform DNS resolution. Use `resolveAndValidateUrl` at fetch-time
 * to also block DNS rebinding attacks.
 *
 * Returns true if the URL passes all static SSRF checks, false otherwise.
 */
export function isUrlSafe(url: string): boolean {
  if (isAllowlisted(url)) return true;

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

/**
 * Resolve a URL's hostname via DNS and validate that ALL resolved IPs
 * are in public ranges. Blocks DNS rebinding attacks where a domain
 * resolves to a private/internal IP.
 *
 * Returns `{ safe: true }` or `{ safe: false, reason: string }`.
 *
 * Should be called at fetch-time (cron trigger), after `isUrlSafe` has
 * already passed at save-time.
 */
export async function resolveAndValidateUrl(
  url: string,
): Promise<{ safe: true } | { safe: false; reason: string }> {
  if (isAllowlisted(url)) return { safe: true };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { safe: false, reason: "Invalid URL" };
  }

  const hostname = parsed.hostname;

  // If hostname is already an IP, just check it directly
  if (ipToInt(hostname) !== null) {
    if (isPrivateIp(hostname)) {
      return { safe: false, reason: `Resolved IP ${hostname} is in a private range` };
    }
    return { safe: true };
  }

  // DNS resolve the hostname
  let addresses: string[];
  try {
    addresses = await resolve4(hostname);
  } catch {
    return { safe: false, reason: `DNS resolution failed for ${hostname}` };
  }

  if (addresses.length === 0) {
    return { safe: false, reason: `No DNS records found for ${hostname}` };
  }

  // Check ALL resolved IPs — fail if any is private
  for (const ip of addresses) {
    if (isPrivateIp(ip)) {
      return {
        safe: false,
        reason: `${hostname} resolves to private IP ${ip}`,
      };
    }
  }

  return { safe: true };
}
