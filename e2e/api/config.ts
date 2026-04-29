/**
 * E2E test configuration — shared constants for all API tests.
 */

export const BASE_URL = "http://localhost:17018";

export const TEST_PROJECT = {
  id: "mnp039joh6yiala5UY0Hh",
  name: "backy-test",
  webhookToken: "test-webhook-token-for-e2e",
} as const;

/**
 * Helper to build full URL from path.
 */
export function url(path: string): string {
  return `${BASE_URL}${path}`;
}

/**
 * Helper for JSON POST/PUT/DELETE requests.
 */
export async function jsonRequest(
  method: "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<Response> {
  return fetch(url(path), {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}
