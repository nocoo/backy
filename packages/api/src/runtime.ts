/**
 * RuntimeContext — the single boundary @backy/api handlers cross to reach
 * the host runtime. Every "fact about the world" (D1, R2, env vars,
 * uptime) is reached via ctx, never via globals like `process.env` or
 * a singleton SDK client. This lets the same handlers run under the
 * Next.js app (REST D1 + S3 R2 + node process) and Cloudflare Workers
 * (D1 binding + R2 binding + worker globals) without conditional code.
 */

export interface D1QueryMeta {
  changes?: number;
  last_row_id?: number;
  rows_read?: number;
  rows_written?: number;
}

export interface D1Adapter {
  query<T = unknown>(
    sql: string,
    params?: unknown[],
  ): Promise<{ results: T[]; meta?: D1QueryMeta }>;
}

export interface R2GetResult {
  body: ReadableStream<Uint8Array> | null;
  bytes: () => Promise<Uint8Array>;
  contentType?: string;
  contentLength?: number;
}

export interface R2HeadResult {
  contentLength: number;
  contentType?: string;
}

export interface R2PresignUploadOpts {
  contentType: string;
  contentLength: number;
}

export interface R2Adapter {
  put(
    key: string,
    body: Uint8Array | Buffer | ArrayBuffer | ReadableStream,
    opts?: { contentType?: string },
  ): Promise<void>;
  get(key: string): Promise<R2GetResult | null>;
  head(key: string): Promise<R2HeadResult | null>;
  delete(key: string): Promise<void>;
  copy(sourceKey: string, destKey: string): Promise<void>;
  presignDownload(key: string, ttlSeconds: number): Promise<string>;
  presignUpload(
    key: string,
    ttlSeconds: number,
    opts: R2PresignUploadOpts,
  ): Promise<string>;
  ping(): Promise<void>;
}

/**
 * Strongly-typed environment variables consumed by handlers/lib code.
 * The host wires this up from `process.env` (legacy) or `c.env`
 * (Worker). Optional fields make handlers tolerate dev/test envs.
 */
export interface BackyEnv {
  // D1 REST credentials (legacy host only — Worker uses bindings)
  D1_ACCOUNT_ID?: string;
  D1_DATABASE_ID?: string;
  D1_API_TOKEN?: string;

  // R2 S3 credentials (legacy host only — Worker uses bindings)
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_ACCOUNT_ID?: string;
  R2_BUCKET_NAME?: string;
  R2_S3_ENDPOINT?: string;

  // Cron auth shared secret
  CRON_SECRET?: string;

  // Reverse-proxy host allowlist + SSRF allowlist
  ALLOWED_HOSTS?: string;
  SSRF_ALLOWLIST?: string;

  // External services
  ECHO_API_URL?: string;
  ECHO_API_KEY?: string;

  // App version surfaced by /api/live
  NEXT_PUBLIC_APP_VERSION?: string;

  // Test bypass for `db/seed-test-project`
  E2E_SKIP_AUTH?: string;
}

export interface RuntimeInfo {
  /** Process uptime in seconds. Returns null on runtimes without a process clock (Workers). */
  uptimeSeconds(): number | null;
}

export interface RuntimeContext {
  db: D1Adapter;
  r2: R2Adapter;
  env: BackyEnv;
  info: RuntimeInfo;
}

/** Node/Bun runtime info backed by `process.uptime()`. */
export function nodeRuntimeInfo(): RuntimeInfo {
  return {
    uptimeSeconds: () =>
      typeof process !== "undefined" && typeof process.uptime === "function"
        ? Math.floor(process.uptime())
        : null,
  };
}

/** Worker-flavoured runtime info — process clocks are not available. */
export function workerRuntimeInfo(): RuntimeInfo {
  return {
    uptimeSeconds: () => null,
  };
}
