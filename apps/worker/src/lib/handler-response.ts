import type { HandlerResponse } from "@backy/api/http";

/**
 * Translate a framework-agnostic HandlerResponse into a Fetch Response.
 * Mirrors the legacy adapter at `apps/web_legacy/src/lib/handler-response.ts`.
 */
export function toResponse(r: HandlerResponse): Response {
  switch (r.kind) {
    case "json":
      return new Response(JSON.stringify(r.body), {
        status: r.status,
        headers: { "content-type": "application/json", ...(r.headers ?? {}) },
      });
    case "bytes": {
      const body: BodyInit = r.bytes as unknown as BodyInit;
      return new Response(body, {
        status: r.status,
        headers: { "content-type": r.contentType, ...(r.headers ?? {}) },
      });
    }
    case "text":
      return new Response(r.text, {
        status: r.status,
        headers: {
          "content-type": r.contentType ?? "text/plain; charset=utf-8",
          ...(r.headers ?? {}),
        },
      });
    case "empty":
      return new Response(null, { status: r.status, ...(r.headers ?? {}) });
  }
}

/** Extract client IP, preferring CF's hint then standard forwarded headers. */
export function clientIpOf(req: Request): string | null {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}
