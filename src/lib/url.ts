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

import { resolve4, resolve6 } from "node:dns/promises";
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
 * Check if an IPv6 address is in a private/reserved range.
 * Handles both raw addresses ("::1") and bracketed ("[::1]").
 *
 * Blocked ranges:
 *   - ::1             loopback
 *   - fe80::/10       link-local
 *   - fc00::/7        unique local (ULA: fc00::/8 + fd00::/8)
 *   - ::ffff:0:0/96   IPv4-mapped (delegates to isPrivateIp for the embedded v4)
 *   - ::              unspecified
 */
export function isPrivateIpv6(addr: string): boolean {
  // Strip brackets if present
  let raw = addr;
  if (raw.startsWith("[") && raw.endsWith("]")) {
    raw = raw.slice(1, -1);
  }

  // Normalize to full 8-group expansion for prefix matching
  const expanded = expandIpv6(raw);
  if (expanded === null) return false;

  // Loopback ::1
  if (expanded === "0000:0000:0000:0000:0000:0000:0000:0001") return true;

  // Unspecified ::
  if (expanded === "0000:0000:0000:0000:0000:0000:0000:0000") return true;

  const firstGroup = parseInt(expanded.slice(0, 4), 16);

  // fe80::/10 — link-local (first 10 bits = 1111 1110 10)
  if ((firstGroup & 0xffc0) === 0xfe80) return true;

  // fc00::/7 — unique local (first 7 bits = 1111 110)
  if ((firstGroup & 0xfe00) === 0xfc00) return true;

  // ::ffff:x.x.x.x — IPv4-mapped IPv6
  // Expanded form: 0000:0000:0000:0000:0000:ffff:XXYY:ZZWW
  if (expanded.startsWith("0000:0000:0000:0000:0000:ffff:")) {
    const v4Hex = expanded.slice(30); // "XXYY:ZZWW"
    const parts = v4Hex.split(":");
    const hi = parseInt(parts[0]!, 16);
    const lo = parseInt(parts[1]!, 16);
    const a = (hi >> 8) & 0xff;
    const b = hi & 0xff;
    const c = (lo >> 8) & 0xff;
    const d = lo & 0xff;
    return isPrivateIp(`${a}.${b}.${c}.${d}`);
  }

  return false;
}

/**
 * Expand an IPv6 address to its full 8-group hex representation.
 * Handles mixed notation (::ffff:192.168.1.1) by converting trailing
 * dotted-decimal IPv4 to two hex groups.
 * Returns null for invalid addresses.
 */
function expandIpv6(addr: string): string | null {
  let normalized = addr;

  // Handle mixed IPv4-in-IPv6 notation (e.g. ::ffff:192.168.1.1)
  const lastColon = normalized.lastIndexOf(":");
  const tail = normalized.slice(lastColon + 1);
  if (tail.includes(".")) {
    // Convert IPv4 part to two hex groups
    const v4Parts = tail.split(".");
    if (v4Parts.length !== 4) return null;
    const nums = v4Parts.map((p) => parseInt(p, 10));
    if (nums.some((n) => isNaN(n) || n < 0 || n > 255)) return null;
    const hi = ((nums[0]! << 8) | nums[1]!) & 0xffff;
    const lo = ((nums[2]! << 8) | nums[3]!) & 0xffff;
    normalized = normalized.slice(0, lastColon + 1) +
      hi.toString(16).padStart(4, "0") + ":" +
      lo.toString(16).padStart(4, "0");
  }

  // Handle :: expansion
  const parts = normalized.split("::");
  if (parts.length > 2) return null; // multiple :: is invalid

  let groups: string[];
  if (parts.length === 2) {
    const left = parts[0] ? parts[0].split(":") : [];
    const right = parts[1] ? parts[1].split(":") : [];
    const missing = 8 - left.length - right.length;
    if (missing < 0) return null;
    groups = [...left, ...Array(missing).fill("0"), ...right];
  } else {
    groups = normalized.split(":");
  }

  if (groups.length !== 8) return null;

  // Validate and pad each group
  const padded: (string | null)[] = groups.map((g) => {
    if (g.length > 4 || !/^[0-9a-fA-F]{0,4}$/.test(g)) return null;
    return g.padStart(4, "0").toLowerCase();
  });

  if (padded.some((g) => g === null)) return null;
  return (padded as string[]).join(":");
}

/**
 * Check if the URL matches the SSRF_ALLOWLIST by comparing parsed origins.
 *
 * Each entry in SSRF_ALLOWLIST is parsed as a URL, and matching is done by
 * comparing protocol + hostname + port (the origin). This prevents bypass
 * via crafted hostnames like "api.example.com.evil.tld" that would pass a
 * naive string prefix check.
 *
 * Returns true if the URL is allowlisted (bypasses all SSRF checks).
 */
function isAllowlisted(url: string): boolean {
  const allowlist = process.env.SSRF_ALLOWLIST;
  if (!allowlist) return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const entries = allowlist.split(",").map((s) => s.trim()).filter(Boolean);
  return entries.some((entry) => {
    try {
      const allowed = new URL(entry);
      return (
        parsed.protocol === allowed.protocol &&
        parsed.hostname === allowed.hostname &&
        parsed.port === allowed.port
      );
    } catch {
      return false;
    }
  });
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

  // Check IPv6 private/reserved ranges (loopback, link-local, ULA, mapped)
  if (isPrivateIpv6(hostname)) {
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
 * (both A and AAAA records) are in public ranges. Blocks DNS rebinding
 * attacks where a domain resolves to a private/internal IP.
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

  // If hostname is already an IPv4 literal, check it directly
  if (ipToInt(hostname) !== null) {
    if (isPrivateIp(hostname)) {
      return { safe: false, reason: `Resolved IP ${hostname} is in a private range` };
    }
    return { safe: true };
  }

  // If hostname is an IPv6 literal (bracketed), check it directly
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    if (isPrivateIpv6(hostname)) {
      return { safe: false, reason: `IPv6 address ${hostname} is in a private range` };
    }
    return { safe: true };
  }

  // DNS resolve the hostname — query both A (IPv4) and AAAA (IPv6) records
  const [v4Result, v6Result] = await Promise.allSettled([
    resolve4(hostname),
    resolve6(hostname),
  ]);

  const v4Addresses = v4Result.status === "fulfilled" ? v4Result.value : [];
  const v6Addresses = v6Result.status === "fulfilled" ? v6Result.value : [];

  // If both lookups failed, no records at all
  if (v4Addresses.length === 0 && v6Addresses.length === 0) {
    if (v4Result.status === "rejected" && v6Result.status === "rejected") {
      return { safe: false, reason: `DNS resolution failed for ${hostname}` };
    }
    return { safe: false, reason: `No DNS records found for ${hostname}` };
  }

  // Check ALL resolved IPv4 addresses
  for (const ip of v4Addresses) {
    if (isPrivateIp(ip)) {
      return {
        safe: false,
        reason: `${hostname} resolves to private IP ${ip}`,
      };
    }
  }

  // Check ALL resolved IPv6 addresses
  for (const ip of v6Addresses) {
    if (isPrivateIpv6(ip)) {
      return {
        safe: false,
        reason: `${hostname} resolves to private IPv6 ${ip}`,
      };
    }
  }

  return { safe: true };
}
