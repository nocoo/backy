/**
 * Framework-agnostic handler response contract.
 *
 * Handlers in @backy/api return HandlerResponse values; an HTTP adapter
 * (e.g. apps/web/src/lib/http.ts) translates them into a real Response.
 */

export type HandlerResponse =
  | {
      kind: "json";
      status: number;
      body: unknown;
      headers?: Record<string, string>;
    }
  | {
      kind: "bytes";
      status: number;
      bytes: Uint8Array;
      contentType: string;
      headers?: Record<string, string>;
    }
  | {
      kind: "empty";
      status: number;
      headers?: Record<string, string>;
    }
  | {
      kind: "text";
      status: number;
      text: string;
      contentType?: string;
      headers?: Record<string, string>;
    };

export const json = (
  status: number,
  body: unknown,
  headers?: Record<string, string>,
): HandlerResponse => ({
  kind: "json",
  status,
  body,
  ...(headers && { headers }),
});

export const empty = (
  status: number,
  headers?: Record<string, string>,
): HandlerResponse => ({
  kind: "empty",
  status,
  ...(headers && { headers }),
});

export const bytes = (
  status: number,
  data: Uint8Array,
  contentType: string,
  headers?: Record<string, string>,
): HandlerResponse => ({
  kind: "bytes",
  status,
  bytes: data,
  contentType,
  ...(headers && { headers }),
});

export const text = (
  status: number,
  body: string,
  contentType?: string,
  headers?: Record<string, string>,
): HandlerResponse => ({
  kind: "text",
  status,
  text: body,
  ...(contentType && { contentType }),
  ...(headers && { headers }),
});
