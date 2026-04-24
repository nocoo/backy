/**
 * Legacy Next.js host runtime factory.
 *
 * Wires `process.env` once and constructs a singleton {@link RuntimeContext}
 * that handlers consume. Keeps `process.env` reads at the host edge so
 * `@backy/api` itself stays portable to the Cloudflare Worker host.
 */

import { createRestD1Adapter } from "@backy/api/db/d1-rest-adapter";
import { createS3R2Adapter } from "@backy/api/r2/s3-adapter";
import {
  nodeRuntimeInfo,
  type BackyEnv,
  type RuntimeContext,
} from "@backy/api/runtime";

const ENV_KEYS = [
  "D1_ACCOUNT_ID",
  "D1_DATABASE_ID",
  "D1_API_TOKEN",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_ACCOUNT_ID",
  "R2_BUCKET_NAME",
  "CRON_SECRET",
  "ALLOWED_HOSTS",
  "SSRF_ALLOWLIST",
  "ECHO_API_URL",
  "ECHO_API_KEY",
  "NEXT_PUBLIC_APP_VERSION",
  "E2E_SKIP_AUTH",
] as const satisfies readonly (keyof BackyEnv)[];

function loadEnv(): BackyEnv {
  const env: BackyEnv = {};
  for (const key of ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

let testCtxOverride: RuntimeContext | null = null;

/** Test-only override for in-process E2E dispatch. */
export function setTestCtxOverride(ctx: RuntimeContext | null): void {
  testCtxOverride = ctx;
}

export function getCtx(): RuntimeContext {
  if (testCtxOverride) return testCtxOverride;
  const env = loadEnv();
  return {
    db: createRestD1Adapter(env),
    r2: createS3R2Adapter(env),
    env,
    info: nodeRuntimeInfo(),
  };
}
