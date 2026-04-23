/**
 * HTTP adapter — translate framework-agnostic HandlerResponse from
 * @backy/api into a Next.js Response.
 */
import { NextResponse } from "next/server";
import type { HandlerResponse } from "@backy/api";

export function toResponse(r: HandlerResponse): Response {
  switch (r.kind) {
    case "empty":
      return new Response(null, {
        status: r.status,
        ...(r.headers && { headers: r.headers }),
      });
    case "bytes":
      return new Response(new Uint8Array(r.bytes), {
        status: r.status,
        headers: { "content-type": r.contentType, ...r.headers },
      });
    case "text":
      return new Response(r.text, {
        status: r.status,
        headers: {
          ...(r.contentType && { "content-type": r.contentType }),
          ...r.headers,
        },
      });
    case "json":
    default:
      return NextResponse.json(r.body, {
        status: r.status,
        ...(r.headers && { headers: r.headers }),
      });
  }
}
