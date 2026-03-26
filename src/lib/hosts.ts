/**
 * Shared host validation for reverse-proxy headers.
 *
 * Prevents host-header injection by validating `x-forwarded-host`
 * against an explicit allowlist before trusting it.
 */

/** Trusted hosts parsed from ALLOWED_HOSTS env (comma-separated). */
export const ALLOWED_HOSTS = new Set(
  (process.env.ALLOWED_HOSTS ?? "backy.hexly.ai,localhost:7026")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean),
);

/**
 * Build the base URL for the current request, respecting reverse-proxy
 * headers **only** when the forwarded host is in the allowlist.
 *
 * Falls back to the raw request URL origin when the header is missing
 * or untrusted.
 */
export function buildBaseUrl(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";

  if (forwardedHost && ALLOWED_HOSTS.has(forwardedHost)) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
