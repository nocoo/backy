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

/**
 * Execute a SQL query against Cloudflare D1 via HTTP API.
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

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("D1 HTTP error:", error);
    throw new Error("D1 query failed");
  }

  const data: D1Response<T> = await response.json();

  if (!data.success) {
    const detail = data.errors.map((e) => e.message).join(", ");
    console.error("D1 query error:", detail);
    if (/unique/i.test(detail)) {
      throw new Error("UNIQUE constraint failed");
    }
    throw new Error("D1 query failed");
  }

  return data.result[0]?.results ?? [];
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
