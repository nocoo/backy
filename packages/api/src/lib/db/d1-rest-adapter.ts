/**
 * REST D1 adapter — Cloudflare D1 over the v4 HTTP API.
 *
 * Used by the legacy Next.js host where Worker D1 bindings are not
 * available. The adapter takes its credentials via `BackyEnv` so the
 * handlers stay free of direct environment-global reads.
 */

import type { BackyEnv, D1Adapter, D1QueryMeta } from "../../runtime";

interface D1Response<T> {
  success: boolean;
  result: Array<{
    results: T[];
    success: boolean;
    meta: D1QueryMeta;
  }>;
  errors: Array<{ message: string }>;
}

/** Max retry attempts for transient D1 errors (timeouts, 5xx). */
const D1_MAX_RETRIES = 3;

/** Base delay in ms for exponential backoff between retries. */
const D1_RETRY_BASE_MS = 500;

/** Check if a D1 error is transient and worth retrying. */
function isTransientError(status: number, body: string): boolean {
  if (status >= 500) return true;
  if (body.includes("7429")) return true;
  if (body.includes("exceeded timeout")) return true;
  return false;
}

export interface RestD1AdapterOptions {
  /** Override the base URL (used by tests). */
  baseUrl?: string;
  /** Override the global fetch (used by tests). */
  fetch?: typeof globalThis.fetch;
  /** Override the retry sleep helper (used by tests to skip delays). */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createRestD1Adapter(
  env: Pick<BackyEnv, "D1_ACCOUNT_ID" | "D1_DATABASE_ID" | "D1_API_TOKEN">,
  options: RestD1AdapterOptions = {},
): D1Adapter {
  const accountId = env.D1_ACCOUNT_ID;
  const databaseId = env.D1_DATABASE_ID;
  const token = env.D1_API_TOKEN;

  const fetchImpl = options.fetch ?? globalThis.fetch;
  const sleep = options.sleep ?? defaultSleep;

  return {
    async query<T>(sql: string, params: unknown[] = []) {
      if (!accountId || !databaseId || !token) {
        throw new Error("D1 credentials not configured");
      }

      const base =
        options.baseUrl ?? "https://api.cloudflare.com/client/v4";
      const url = `${base}/accounts/${accountId}/d1/database/${databaseId}/query`;
      const requestBody = JSON.stringify({ sql, params });

      let lastError: Error | undefined;

      for (let attempt = 0; attempt <= D1_MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          const delay = D1_RETRY_BASE_MS * 2 ** (attempt - 1);
          console.warn(`D1 retry ${attempt}/${D1_MAX_RETRIES} after ${delay}ms`);
          await sleep(delay);
        }

        const response = await fetchImpl(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: requestBody,
        });

        if (!response.ok) {
          const error = await response.text();
          if (
            attempt < D1_MAX_RETRIES &&
            isTransientError(response.status, error)
          ) {
            console.warn("D1 transient error:", error);
            lastError = new Error("D1 query failed");
            continue;
          }
          console.error("D1 HTTP error:", error);
          throw new Error("D1 query failed");
        }

        const data = (await response.json()) as D1Response<T>;

        if (!data.success) {
          const detail = data.errors.map((e) => e.message).join(", ");
          if (attempt < D1_MAX_RETRIES && isTransientError(200, detail)) {
            console.warn("D1 transient API error:", detail);
            lastError = new Error("D1 query failed");
            continue;
          }
          console.error("D1 query error:", detail);
          if (/unique/i.test(detail)) {
            throw new Error("UNIQUE constraint failed");
          }
          throw new Error("D1 query failed");
        }

        const meta = data.result[0]?.meta;
        return {
          results: data.result[0]?.results ?? [],
          ...(meta !== undefined && { meta }),
        };
      }

      throw lastError ?? new Error("D1 query failed");
    },
  };
}

/** Check if D1 REST credentials are present in the supplied env. */
export function isRestD1Configured(env: BackyEnv): boolean {
  return !!(env.D1_ACCOUNT_ID && env.D1_DATABASE_ID && env.D1_API_TOKEN);
}
