/**
 * Cloudflare D1 HTTP client — raw SQL queries via the REST API.
 *
 * Environment variables required:
 *   D1_ACCOUNT_ID, D1_DATABASE_ID, D1_API_TOKEN
 */

export interface D1Response<T> {
  success: boolean;
  result: Array<{
    results: T[];
    success: boolean;
    meta: {
      changes: number;
      last_row_id: number;
      rows_read?: number;
      rows_written?: number;
    };
  }>;
  errors: Array<{ message: string }>;
}

/** Max retry attempts for transient D1 errors (timeouts, 5xx). */
const D1_MAX_RETRIES = 3;

/** Base delay in ms for exponential backoff between retries. */
const D1_RETRY_BASE_MS = 500;

/** Check if a D1 error is transient and worth retrying. */
function isTransientError(status: number, body: string): boolean {
  // HTTP-level server errors
  if (status >= 500) return true;
  // D1 timeout error code 7429
  if (body.includes("7429")) return true;
  // Storage operation timeout
  if (body.includes("exceeded timeout")) return true;
  return false;
}

/**
 * Execute a SQL query against Cloudflare D1 via HTTP API.
 * Retries up to {@link D1_MAX_RETRIES} times on transient errors
 * (5xx, timeout code 7429) with exponential backoff.
 */
export async function executeD1Query<T>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const accountId = process.env.D1_ACCOUNT_ID;
  const databaseId = process.env.D1_DATABASE_ID;
  const token = process.env.D1_API_TOKEN;

  if (!accountId || !databaseId || !token) {
    throw new Error("D1 credentials not configured");
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
  const requestBody = JSON.stringify({ sql, params });

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= D1_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = D1_RETRY_BASE_MS * 2 ** (attempt - 1);
      console.warn(`D1 retry ${attempt}/${D1_MAX_RETRIES} after ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: requestBody,
    });

    if (!response.ok) {
      const error = await response.text();
      if (attempt < D1_MAX_RETRIES && isTransientError(response.status, error)) {
        console.warn("D1 transient error:", error);
        lastError = new Error("D1 query failed");
        continue;
      }
      console.error("D1 HTTP error:", error);
      throw new Error("D1 query failed");
    }

    const data: D1Response<T> = await response.json();

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

    return data.result[0]?.results ?? [];
  }

  // All retries exhausted
  throw lastError ?? new Error("D1 query failed");
}

/**
 * Check if D1 is configured and available.
 */
export function isD1Configured(): boolean {
  return !!(
    process.env.D1_ACCOUNT_ID &&
    process.env.D1_DATABASE_ID &&
    process.env.D1_API_TOKEN
  );
}
