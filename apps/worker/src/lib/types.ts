/**
 * Hono environment shape for `apps/worker`.
 *
 * `Bindings` mirrors `wrangler.toml`: D1, R2, plus the env vars consumed
 * by `@backy/api` handlers. `Variables` are values stashed by middleware
 * for downstream handlers (most importantly the Access-derived email).
 */
export type Bindings = {
  DB: D1Database;
  R2: R2Bucket;

  ENVIRONMENT?: string;

  // Access verification
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;

  // Cron shared secret (HTTP path only — scheduled() uses binding-only)
  CRON_SECRET?: string;

  // Reverse-proxy host allowlist + SSRF guards
  ALLOWED_HOSTS?: string;
  SSRF_ALLOWLIST?: string;

  // External services
  ECHO_API_URL?: string;
  ECHO_API_KEY?: string;

  // R2 presign (binding R2 has no native presign, so we hand the worker
  // S3-compat creds for a presigner)
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_ACCOUNT_ID?: string;
  R2_BUCKET_NAME?: string;
  R2_S3_ENDPOINT?: string;
  R2_S3_SIGN_ENDPOINT?: string;

  // E2E skip flag — both auth bypass and seed handler gate
  E2E_SKIP_AUTH?: string;

  // App version surfaced by /api/live
  NEXT_PUBLIC_APP_VERSION?: string;
};

import type { RuntimeContext } from "@backy/api/runtime";

export type Variables = {
  accessAuthenticated?: boolean;
  accessEmail?: string;
  ctx: RuntimeContext;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
