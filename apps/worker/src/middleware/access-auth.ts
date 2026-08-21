import type { Context, Next } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AppEnv } from "../lib/types";
import { isLocalhost } from "./is-localhost";

/**
 * Cloudflare Access JWT middleware.
 *
 * Public-path policy (must match `docs/07` exactly — do NOT use prefix
 * globs on `/api/cron/*` since `POST /api/cron/trigger/:projectId` must
 * stay protected by Access):
 *
 *   - GET /api/live                                   (healthcheck)
 *   - HEAD|GET|POST /api/webhook/:projectId           (token-auth)
 *   - GET /api/restore/:id                            (token-auth)
 *   - POST /api/cron/trigger                          (CRON_SECRET Bearer)
 *
 * Localhost (`wrangler dev` / unit tests) is short-circuited so dev does
 * not need a real Access setup. `E2E_SKIP_AUTH=true` does the same on
 * the test environment so L2 e2e can hit the worker without SSO.
 *
 * Otherwise we verify `Cf-Access-Jwt-Assertion` against the team's JWKS
 * and stash the email for `/api/me`.
 */

let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksCacheTeamDomain: string | null = null;

function getJWKS(teamDomain: string) {
  if (jwksCache && jwksCacheTeamDomain === teamDomain) return jwksCache;
  jwksCache = createRemoteJWKSet(
    new URL(`https://${teamDomain}/cdn-cgi/access/certs`),
  );
  jwksCacheTeamDomain = teamDomain;
  return jwksCache;
}

/** Test-only: drop the cached JWKS so unit tests start from a clean slate. */
export function __resetJwksCacheForTests(): void {
  jwksCache = null;
  jwksCacheTeamDomain = null;
}

const NANOID = "[A-Za-z0-9_-]{21}";
const DIRECT_INIT = new RegExp(`^/api/webhook/${NANOID}/uploads$`);
const DIRECT_COMPLETE = new RegExp(
  `^/api/webhook/${NANOID}/uploads/${NANOID}/complete$`,
);
const DIRECT_ABORT = new RegExp(`^/api/webhook/${NANOID}/uploads/${NANOID}$`);

function isPublicPath(method: string, path: string): boolean {
  if (path.includes("%")) return false;
  if (method === "GET" && path === "/api/live") return true;
  if (method === "POST" && path === "/api/cron/trigger") return true;
  if (
    (method === "HEAD" || method === "GET" || method === "POST") &&
    path.startsWith("/api/webhook/") &&
    // Exactly one segment after /api/webhook/ — guards against unforeseen
    // sub-routes accidentally bypassing Access.
    path.slice("/api/webhook/".length).indexOf("/") === -1
  ) {
    return true;
  }
  if (method === "POST" && DIRECT_INIT.test(path)) return true;
  if (method === "POST" && DIRECT_COMPLETE.test(path)) return true;
  if (method === "DELETE" && DIRECT_ABORT.test(path)) return true;
  if (
    method === "GET" &&
    path.startsWith("/api/restore/") &&
    path.slice("/api/restore/".length).indexOf("/") === -1
  ) {
    return true;
  }
  return false;
}

export async function accessAuth(c: Context<AppEnv>, next: Next) {
  if (isPublicPath(c.req.method, c.req.path)) return next();

  const env = c.env ?? ({} as AppEnv["Bindings"]);

  if (env.E2E_SKIP_AUTH === "true" || isLocalhost(c)) {
    c.set("accessAuthenticated", true);
    c.set("accessEmail", "dev@local");
    return next();
  }

  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN;
  const aud = env.CF_ACCESS_AUD;
  if (!(teamDomain && aud)) {
    return c.json({ error: "Cloudflare Access not configured" }, 500);
  }

  const jwt = c.req.header("Cf-Access-Jwt-Assertion");
  if (!jwt) return c.json({ error: "Unauthorized" }, 401);

  try {
    const jwks = getJWKS(teamDomain);
    const { payload } = await jwtVerify(jwt, jwks, {
      issuer: `https://${teamDomain}`,
      audience: aud,
    });
    c.set("accessAuthenticated", true);
    if (typeof payload.email === "string") {
      c.set("accessEmail", payload.email);
    }
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return next();
}
