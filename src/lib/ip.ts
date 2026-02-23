/**
 * IP/CIDR validation and enforcement utilities for project allowed IP ranges.
 *
 * Supports formats: "1.2.3.4", "1.2.3.4/8", "192.168.0.0/16"
 * Stored as comma-separated string in DB, e.g. "1.2.3.4/8,10.0.0.0/16"
 */

const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * Validate a single IP or CIDR notation string.
 * Returns true if valid, false otherwise.
 */
export function isValidCidr(cidr: string): boolean {
  const trimmed = cidr.trim();
  if (!trimmed) return false;

  const parts = trimmed.split("/");
  if (parts.length > 2) return false;

  // Validate IP portion
  const ipPart = parts[0];
  if (!ipPart) return false;
  const ipMatch = ipPart.match(IPV4_REGEX);
  if (!ipMatch) return false;

  // Each octet must be 0-255
  for (let i = 1; i <= 4; i++) {
    const octet = parseInt(ipMatch[i] ?? "", 10);
    if (octet < 0 || octet > 255) return false;
  }

  // Validate prefix length if present
  if (parts.length === 2) {
    const prefixStr = parts[1] ?? "";
    const prefix = parseInt(prefixStr, 10);
    if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;
    if (prefixStr !== String(prefix)) return false; // no leading zeros
  }

  return true;
}

/**
 * Validate a comma-separated list of IP/CIDR ranges.
 * Returns { valid: true } or { valid: false, invalid: string[] }.
 */
export function validateAllowedIps(
  value: string,
): { valid: true } | { valid: false; invalid: string[] } {
  const entries = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (entries.length === 0) return { valid: true };

  const invalid = entries.filter((e) => !isValidCidr(e));
  if (invalid.length > 0) return { valid: false, invalid };
  return { valid: true };
}

/**
 * Normalize a comma-separated list of IP/CIDR ranges.
 * Trims whitespace, removes empty entries, deduplicates.
 * Returns null if empty (meaning "allow all").
 */
export function normalizeAllowedIps(value: string): string | null {
  const entries = [
    ...new Set(
      value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  return entries.length > 0 ? entries.join(",") : null;
}

/**
 * Convert an IPv4 string to a 32-bit integer.
 * Returns null if the IP is invalid.
 */
function ipToInt(ip: string): number | null {
  const match = ip.trim().match(IPV4_REGEX);
  if (!match) return null;

  const a = parseInt(match[1]!, 10);
  const b = parseInt(match[2]!, 10);
  const c = parseInt(match[3]!, 10);
  const d = parseInt(match[4]!, 10);

  if (a > 255 || b > 255 || c > 255 || d > 255) return null;

  // Use unsigned 32-bit arithmetic via >>> 0
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

/**
 * Check if an IP address falls within a single CIDR range.
 * A plain IP (no prefix) is treated as /32 (exact match).
 */
function isIpInCidr(ip: string, cidr: string): boolean {
  const ipInt = ipToInt(ip);
  if (ipInt === null) return false;

  const parts = cidr.trim().split("/");
  const rangeIp = ipToInt(parts[0]!);
  if (rangeIp === null) return false;

  const prefix = parts.length === 2 ? parseInt(parts[1]!, 10) : 32;
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;

  if (prefix === 0) return true; // 0.0.0.0/0 matches everything

  // Build mask: e.g. prefix=24 → 0xFFFFFF00
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (rangeIp & mask);
}

/**
 * Check if a client IP is allowed by a project's allowed_ips setting.
 *
 * @param clientIp - The client's IPv4 address
 * @param allowedIps - Comma-separated CIDR list (from project.allowed_ips)
 * @returns true if the IP matches any range, false if not (fail-closed)
 */
export function isIpAllowed(clientIp: string, allowedIps: string): boolean {
  const ranges = allowedIps
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Truthy but empty after parsing → fail-closed (deny all)
  if (ranges.length === 0) return false;

  return ranges.some((range) => isIpInCidr(clientIp, range));
}

/**
 * Extract the real client IP from request headers.
 *
 * Priority:
 *   1. x-envoy-external-address — set by Railway's Envoy proxy, cannot be spoofed
 *   2. x-forwarded-for (rightmost entry) — last hop added by trusted proxy
 *
 * Strips IPv6-mapped IPv4 prefix (::ffff:) for compatibility.
 * Returns null if no IP can be determined.
 */
export function getClientIp(request: Request): string | null {
  // Railway/Envoy sets the true external client IP here
  const envoyIp = request.headers.get("x-envoy-external-address");
  if (envoyIp?.trim()) {
    return stripIpv6Mapped(envoyIp.trim());
  }

  // Fallback: rightmost entry in x-forwarded-for (added by trusted edge proxy)
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return null;

  const parts = forwarded
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const ip = parts.at(-1);
  if (!ip) return null;

  return stripIpv6Mapped(ip);
}

/**
 * Strip IPv6-mapped IPv4 prefix (::ffff:1.2.3.4 → 1.2.3.4).
 */
function stripIpv6Mapped(ip: string): string {
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  return ip;
}

/**
 * Check IP restriction for a project. Returns a 403 Response if blocked,
 * or null if the request is allowed to proceed.
 *
 * Used by webhook and restore route handlers to avoid code duplication.
 */
export function enforceIpRestriction(
  request: Request,
  allowedIps: string | null,
  options?: { headRequest?: boolean },
): Response | null {
  if (!allowedIps) return null; // no restriction configured

  const clientIp = getClientIp(request);
  if (!clientIp || !isIpAllowed(clientIp, allowedIps)) {
    if (options?.headRequest) {
      return new Response(null, { status: 403 });
    }
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}
