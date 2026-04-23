import { describe, expect, test } from "bun:test";
import { toResponse } from "@/lib/http";

describe("toResponse adapter", () => {
  test("json kind", async () => {
    const r = toResponse({ kind: "json", status: 200, body: { a: 1 } });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ a: 1 });
  });

  test("json with headers", async () => {
    const r = toResponse({
      kind: "json",
      status: 201,
      body: { ok: true },
      headers: { "x-foo": "bar" },
    });
    expect(r.headers.get("x-foo")).toBe("bar");
  });

  test("empty kind", async () => {
    const r = toResponse({ kind: "empty", status: 204 });
    expect(r.status).toBe(204);
    expect(await r.text()).toBe("");
  });

  test("empty with headers", () => {
    const r = toResponse({
      kind: "empty",
      status: 200,
      headers: { "x-y": "z" },
    });
    expect(r.headers.get("x-y")).toBe("z");
  });

  test("bytes kind", async () => {
    const data = new Uint8Array([1, 2, 3]);
    const r = toResponse({
      kind: "bytes",
      status: 200,
      bytes: data,
      contentType: "application/octet-stream",
    });
    expect(r.headers.get("content-type")).toBe("application/octet-stream");
    const buf = new Uint8Array(await r.arrayBuffer());
    expect(buf).toEqual(data);
  });

  test("bytes with extra headers", () => {
    const r = toResponse({
      kind: "bytes",
      status: 200,
      bytes: new Uint8Array(),
      contentType: "image/png",
      headers: { "x-cache": "miss" },
    });
    expect(r.headers.get("x-cache")).toBe("miss");
  });

  test("text kind", async () => {
    const r = toResponse({ kind: "text", status: 200, text: "hello" });
    expect(await r.text()).toBe("hello");
  });

  test("text with content type and headers", () => {
    const r = toResponse({
      kind: "text",
      status: 200,
      text: "ok",
      contentType: "text/plain",
      headers: { "x-a": "b" },
    });
    expect(r.headers.get("content-type")).toBe("text/plain");
    expect(r.headers.get("x-a")).toBe("b");
  });
});
