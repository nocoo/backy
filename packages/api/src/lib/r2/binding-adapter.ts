/**
 * R2 binding adapter — uses Cloudflare Workers' native R2 binding.
 *
 * Used by `apps/worker`. The legacy Next.js host uses
 * `createS3R2Adapter` over the AWS S3 SDK instead. The binding is typed
 * structurally so this file does not need a hard dependency on
 * `@cloudflare/workers-types`.
 *
 * Note: Workers R2 bindings do not support generating presigned URLs
 * directly; the worker is expected to either stream bytes through itself
 * or front R2 with a public bucket / signed URL service. For now,
 * `presignDownload` throws — callers (download/restore handlers) will
 * need a Wave C variant that streams via the worker, or we add a
 * presigning helper using R2's signed URL API.
 */

import type { R2Adapter, R2GetResult, R2PresignUploadOpts } from "../../runtime";

export interface R2BindingObject {
  body: ReadableStream<Uint8Array> | null;
  arrayBuffer(): Promise<ArrayBuffer>;
  httpMetadata?: { contentType?: string };
  size?: number;
}

export interface R2BindingPutOptions {
  httpMetadata?: { contentType?: string };
}

export interface R2Binding {
  put(
    key: string,
    body: ReadableStream | ArrayBuffer | ArrayBufferView | string | null,
    options?: R2BindingPutOptions,
  ): Promise<unknown>;
  get(key: string): Promise<R2BindingObject | null>;
  delete(key: string): Promise<void>;
  head(key: string): Promise<R2BindingObject | null>;
}

export interface BindingR2AdapterOptions {
  /**
   * Hook to produce a presigned download URL. Workers R2 bindings do
   * not natively support presigning, so the host wires this up (e.g.
   * via an S3-compatible signer using R2 access keys, or a route that
   * proxies the bytes through the worker).
   */
  presignDownload?: (key: string, ttlSeconds: number) => Promise<string>;
  presignUpload?: (
    key: string,
    ttlSeconds: number,
    opts: R2PresignUploadOpts,
  ) => Promise<string>;
  copy?: (sourceKey: string, destKey: string) => Promise<void>;
}

export function createBindingR2Adapter(
  bucket: R2Binding,
  options: BindingR2AdapterOptions = {},
): R2Adapter {
  return {
    async put(key, body, opts) {
      const normalised: ReadableStream | ArrayBuffer | ArrayBufferView =
        body instanceof ArrayBuffer || ArrayBuffer.isView(body)
          ? body
          : (body as ReadableStream);
      await bucket.put(key, normalised, {
        ...(opts?.contentType !== undefined && {
          httpMetadata: { contentType: opts.contentType },
        }),
      });
    },
    async get(key) {
      const obj = await bucket.get(key);
      if (!obj) return null;
      const result: R2GetResult = {
        body: obj.body,
        bytes: async () => new Uint8Array(await obj.arrayBuffer()),
        ...(obj.httpMetadata?.contentType !== undefined && {
          contentType: obj.httpMetadata.contentType,
        }),
        ...(obj.size !== undefined && { contentLength: obj.size }),
      };
      return result;
    },
    async delete(key) {
      await bucket.delete(key);
    },
    async head(key) {
      const obj = await bucket.head(key);
      if (!obj) return null;
      return {
        contentLength: obj.size ?? 0,
        ...(obj.httpMetadata?.contentType !== undefined && {
          contentType: obj.httpMetadata.contentType,
        }),
      };
    },
    async copy(sourceKey, destKey) {
      if (!options.copy) {
        throw new Error(
          "R2 binding adapter has no copy implementation; provide one in BindingR2AdapterOptions",
        );
      }
      await options.copy(sourceKey, destKey);
    },
    async presignDownload(key, ttlSeconds) {
      if (!options.presignDownload) {
        throw new Error(
          "R2 binding adapter has no presignDownload implementation; provide one in BindingR2AdapterOptions",
        );
      }
      return options.presignDownload(key, ttlSeconds);
    },
    async presignUpload(key, ttlSeconds, opts) {
      if (!options.presignUpload) {
        throw new Error(
          "R2 binding adapter has no presignUpload implementation; provide one in BindingR2AdapterOptions",
        );
      }
      return options.presignUpload(key, ttlSeconds, opts);
    },
    async ping() {
      // Cheapest probe: HEAD a sentinel key. We don't care if it exists —
      // we only care whether the binding is reachable. Any thrown error
      // bubbles up to the live-check.
      await bucket.head("__healthcheck__");
    },
  };
}
