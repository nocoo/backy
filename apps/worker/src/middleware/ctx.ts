import type { Context, Next } from "hono";
import {
  createBindingD1Adapter,
  type D1Binding,
} from "@backy/api/db/d1-binding-adapter";
import {
  createBindingR2Adapter,
  type R2Binding,
} from "@backy/api/r2/binding-adapter";
import {
  createS3R2Adapter,
  isS3R2Configured,
} from "@backy/api/r2/s3-adapter";
import {
  workerRuntimeInfo,
  type BackyEnv,
  type RuntimeContext,
} from "@backy/api/runtime";
import type { AppEnv } from "../lib/types";

/**
 * Build a per-request `RuntimeContext` from `c.env` bindings + vars and
 * stash it on the Hono context. Routes pull it via `c.get("ctx")`.
 *
 * R2 presigning isn't natively supported by the binding API, so we wire
 * a fall-back S3 presigner using the same R2 access keys when the env
 * vars are configured. If a route asks for a presign URL without those
 * vars set, the binding adapter throws — which is correct behaviour
 * because we genuinely can't sign without credentials.
 */
export function ctxMiddleware() {
  return async (c: Context<AppEnv>, next: Next) => {
    const env: BackyEnv = pickEnv(c.env);
    const db = createBindingD1Adapter(c.env.DB as unknown as D1Binding);
    const presigner = isS3R2Configured(env)
      ? createS3R2Adapter(env)
      : null;
    const r2 = createBindingR2Adapter(c.env.R2 as unknown as R2Binding, {
      ...(presigner && {
        presignDownload: (key, ttl) => presigner.presignDownload(key, ttl),
        presignUpload: (key, ttl, opts) =>
          presigner.presignUpload(key, ttl, opts),
        copy: (sourceKey, destKey) => presigner.copy(sourceKey, destKey),
      }),
    });
    const ctx: RuntimeContext = {
      db,
      r2,
      env,
      info: workerRuntimeInfo(),
    };
    c.set("ctx", ctx);
    await next();
  };
}

function pickEnv(env: AppEnv["Bindings"]): BackyEnv {
  const out: BackyEnv = {};
  if (env.CRON_SECRET !== undefined) out.CRON_SECRET = env.CRON_SECRET;
  if (env.ALLOWED_HOSTS !== undefined) out.ALLOWED_HOSTS = env.ALLOWED_HOSTS;
  if (env.SSRF_ALLOWLIST !== undefined) out.SSRF_ALLOWLIST = env.SSRF_ALLOWLIST;
  if (env.ECHO_API_URL !== undefined) out.ECHO_API_URL = env.ECHO_API_URL;
  if (env.ECHO_API_KEY !== undefined) out.ECHO_API_KEY = env.ECHO_API_KEY;
  if (env.R2_ACCESS_KEY_ID !== undefined)
    out.R2_ACCESS_KEY_ID = env.R2_ACCESS_KEY_ID;
  if (env.R2_SECRET_ACCESS_KEY !== undefined)
    out.R2_SECRET_ACCESS_KEY = env.R2_SECRET_ACCESS_KEY;
  if (env.R2_ACCOUNT_ID !== undefined) out.R2_ACCOUNT_ID = env.R2_ACCOUNT_ID;
  if (env.R2_BUCKET_NAME !== undefined) out.R2_BUCKET_NAME = env.R2_BUCKET_NAME;
  if (env.R2_S3_ENDPOINT !== undefined) out.R2_S3_ENDPOINT = env.R2_S3_ENDPOINT;
  if (env.R2_S3_SIGN_ENDPOINT !== undefined)
    out.R2_S3_SIGN_ENDPOINT = env.R2_S3_SIGN_ENDPOINT;
  if (env.E2E_SKIP_AUTH !== undefined) out.E2E_SKIP_AUTH = env.E2E_SKIP_AUTH;
  if (env.NEXT_PUBLIC_APP_VERSION !== undefined)
    out.NEXT_PUBLIC_APP_VERSION = env.NEXT_PUBLIC_APP_VERSION;
  return out;
}
