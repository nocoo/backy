/**
 * Tiny fetch wrapper for the Backy worker API.
 *
 * - Always sends cookies (Cloudflare Access session) via credentials: "include"
 * - Throws ApiError on non-2xx so SWR / callers can handle status uniformly
 * - Auto-parses JSON when content-type matches; otherwise returns Response
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message?: string,
  ) {
    super(message ?? `API ${status}`);
    this.name = "ApiError";
  }
}

export async function apiFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(url, {
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    const body = await safeBody(res);
    throw new ApiError(res.status, body);
  }
  return res;
}

export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(url, init);
  return (await res.json()) as T;
}

export const swrFetcher = async <T>(url: string): Promise<T> => apiJson<T>(url);

async function safeBody(res: Response): Promise<unknown> {
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
  try {
    return await res.text();
  } catch {
    return null;
  }
}
