import type { Context } from "hono";
import type { AppEnv } from "../lib/types";

/**
 * Determine whether a request is genuinely local / dev (i.e. not on the
 * Cloudflare edge). The Host header is attacker-controlled, so the
 * presence of `c.req.raw.cf` (only populated by the CF edge) is the
 * authoritative signal that we are NOT on localhost.
 *
 * Used by `accessAuth` to short-circuit JWT verification during
 * `wrangler dev` and unit tests.
 */
export function isLocalhost(c: Context<AppEnv>): boolean {
  const host = c.req.header("host") ?? "";
  const onCfEdge = Boolean((c.req.raw as { cf?: unknown }).cf);

  if (onCfEdge) return false;

  return host.startsWith("localhost") || host.startsWith("127.0.0.1");
}
