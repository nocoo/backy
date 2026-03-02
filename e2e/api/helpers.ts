/**
 * Shared helpers for E2E API tests — upload utilities and data builders.
 */

import JSZip from "jszip";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import tar from "tar-stream";
import { state, PROJECT_ID, WEBHOOK_TOKEN, E2E_TAG_PREFIX, TEST_JSON_DATA } from "./config";

const gzipAsync = promisify(gzip);

export function webhookUrl(): string {
  return `${state.baseUrl}/api/webhook/${PROJECT_ID}`;
}

export function tag(): string {
  return `${E2E_TAG_PREFIX}${Date.now()}`;
}

export async function uploadJsonBackup(
  opts: { token?: string; environment?: string; tag?: string; body?: BodyInit; contentType?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.token !== undefined) {
    headers["Authorization"] = `Bearer ${opts.token}`;
  }

  let body: BodyInit;
  if (opts.body !== undefined) {
    body = opts.body;
    if (opts.contentType) {
      headers["Content-Type"] = opts.contentType;
    }
  } else {
    const formData = new FormData();
    const jsonBlob = new Blob([JSON.stringify(TEST_JSON_DATA)], { type: "application/json" });
    formData.append("file", new File([jsonBlob], "backup.json", { type: "application/json" }));
    if (opts.environment) formData.append("environment", opts.environment);
    if (opts.tag) formData.append("tag", opts.tag);
    body = formData;
    headers["Authorization"] = `Bearer ${WEBHOOK_TOKEN}`;
  }

  return fetch(webhookUrl(), { method: "POST", headers, body });
}

export async function createZipWithJson(data: unknown, filename = "data.json"): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(filename, JSON.stringify(data));
  return zip.generateAsync({ type: "uint8array" });
}

export async function createGzWithJson(data: unknown): Promise<Uint8Array> {
  const jsonBuffer = Buffer.from(JSON.stringify(data));
  const compressed = await gzipAsync(jsonBuffer);
  return new Uint8Array(compressed);
}

export async function createTgzWithJson(data: unknown, filename = "data.json"): Promise<Uint8Array> {
  const pack = tar.pack();
  const jsonStr = JSON.stringify(data);
  pack.entry({ name: filename, size: Buffer.byteLength(jsonStr) }, jsonStr);
  pack.finalize();

  // Collect tar stream into buffer
  const chunks: Uint8Array[] = [];
  for await (const chunk of pack) {
    chunks.push(chunk);
  }
  const tarBuffer = Buffer.concat(chunks);
  const compressed = await gzipAsync(tarBuffer);
  return new Uint8Array(compressed);
}
