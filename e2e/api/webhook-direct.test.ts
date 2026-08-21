/**
 * L2: Direct-upload webhook routes.
 *
 * Routes covered:
 *   POST   /api/webhook/:projectId/uploads
 *   POST   /api/webhook/:projectId/uploads/:uploadId/complete
 *   DELETE /api/webhook/:projectId/uploads/:uploadId
 */

import { describe, expect, test, beforeAll } from "bun:test";
import { url, jsonRequest, TEST_PROJECT } from "./config";

const auth = { Authorization: `Bearer ${TEST_PROJECT.webhookToken}` };

async function initUpload(fileName: string, bytes: Uint8Array) {
  const res = await fetch(url(`/api/webhook/${TEST_PROJECT.id}/uploads`), {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      file_name: fileName,
      content_type: "application/octet-stream",
      file_size: bytes.byteLength,
      environment: "test",
      tag: "direct-e2e",
    }),
  });
  return res;
}

describe("L2: API direct upload", () => {
  beforeAll(async () => {
    await jsonRequest("POST", "/api/db/seed-test-project");
  });

  test("init rejects 5000000001 and accepts a small file", async () => {
    const tooBig = await fetch(url(`/api/webhook/${TEST_PROJECT.id}/uploads`), {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        file_name: "huge.bin",
        file_size: 5_000_000_001,
      }),
    });
    expect(tooBig.status).toBe(400);

    const bytes = new Uint8Array([1, 2, 3, 4]);
    const res = await initUpload("e2e.bin", bytes);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      upload_id: string;
      put_url: string;
      headers: Record<string, string>;
      file_key: string;
    };
    expect(body.put_url).toContain("127.0.0.1:17018");
    expect(body.put_url).not.toContain("backy.hexly.ai");
    expect(body.file_key).toContain("/direct/");
    expect(body.headers["If-None-Match"]).toBe("*");
  });

  test("init PUT complete restore round-trip", async () => {
    const payload = new Uint8Array([9, 8, 7, 6, 5]);
    const init = await initUpload("round.bin", payload);
    expect(init.status).toBe(200);
    const body = (await init.json()) as {
      upload_id: string;
      put_url: string;
      headers: Record<string, string>;
      file_key: string;
    };
    expect(body.file_key).not.toBe(
      `direct-staging/${TEST_PROJECT.id}/${body.upload_id}/in.bin`,
    );

    const put = await fetch(body.put_url, {
      method: "PUT",
      headers: body.headers,
      body: payload,
    });
    expect(put.ok).toBe(true);

    const complete = await fetch(url(`/api/webhook/${TEST_PROJECT.id}/uploads/${body.upload_id}/complete`), {
      method: "POST",
      headers: auth,
    });
    expect(complete.status).toBe(201);
    const created = (await complete.json()) as { id: string; file_size: number };
    expect(created.file_size).toBe(payload.byteLength);

    const restore = await fetch(
      url(`/api/restore/${created.id}?token=${TEST_PROJECT.webhookToken}`),
    );
    expect(restore.status).toBe(200);
    const restoreBody = (await restore.json()) as { url: string };
    const downloaded = await fetch(restoreBody.url);
    expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(payload);
  });

  test("complete without object is 404; abort then complete is 410", async () => {
    const missing = await initUpload("missing.bin", new Uint8Array([1]));
    const missingBody = (await missing.json()) as { upload_id: string };
    const completeMissing = await fetch(url(`/api/webhook/${TEST_PROJECT.id}/uploads/${missingBody.upload_id}/complete`), {
      method: "POST",
      headers: auth,
    });
    expect(completeMissing.status).toBe(404);

    const abortInit = await initUpload("abort.bin", new Uint8Array([1, 2]));
    const abortBody = (await abortInit.json()) as { upload_id: string };
    const aborted = await fetch(
      url(`/api/webhook/${TEST_PROJECT.id}/uploads/${abortBody.upload_id}`),
      { method: "DELETE", headers: auth },
    );
    expect(aborted.status).toBe(200);
    const completeAborted = await fetch(url(`/api/webhook/${TEST_PROJECT.id}/uploads/${abortBody.upload_id}/complete`), {
      method: "POST",
      headers: auth,
    });
    expect(completeAborted.status).toBe(410);
  });
});
