/**
 * Shared host validation for reverse-proxy headers.
 *
 * Prevents host-header injection by validating `x-forwarded-host`
 * against an explicit allowlist before trusting it.
 */

import type { BackyEnv } from "../runtime";

const defaultEnv = (): Pick<BackyEnv, "ALLOWED_HOSTS"> => ({});

/** Parse ALLOWED_HOSTS from a BackyEnv. Defaults to localhost dev port. */
export function parseAllowedHosts(
  env: Pick<BackyEnv, "ALLOWED_HOSTS"> = defaultEnv(),
): Set<string> {
  return new Set(
    (env.ALLOWED_HOSTS ?? "localhost:7017")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean),
  );
}

/**
 * Returns true if `host` is in the allowlist parsed from `env`.
 */
export function isAllowedHost(
  envOrHost: Pick<BackyEnv, "ALLOWED_HOSTS"> | string,
  maybeHost?: string,
): boolean {
  if (typeof envOrHost === "string") {
    return parseAllowedHosts().has(envOrHost);
  }
  return parseAllowedHosts(envOrHost).has(maybeHost ?? "");
}

export const ALLOWED_HOSTS = parseAllowedHosts();

/**
 * Build the base URL for the current request, respecting reverse-proxy
 * headers **only** when the forwarded host is in the allowlist.
 *
 * Falls back to the raw request URL origin when the header is missing
 * or untrusted.
 */
export function buildBaseUrl(
  request: Request,
  env: Pick<BackyEnv, "ALLOWED_HOSTS"> = defaultEnv(),
): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";

  if (forwardedHost && isAllowedHost(env, forwardedHost)) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
