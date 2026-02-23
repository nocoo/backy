/**
 * IP/CIDR validation utilities for project allowed IP ranges.
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
