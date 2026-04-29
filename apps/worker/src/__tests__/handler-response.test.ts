import { describe, expect, test } from "vitest";
import { toResponse, clientIpOf } from "../lib/handler-response";

describe("toResponse", () => {
  test("json", async () => {
    const res = toResponse({
      kind: "json",
      status: 201,
      body: { ok: true },
      headers: { "x-custom": "1" },
    });
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("x-custom")).toBe("1");
    expect((await res.json()) as unknown).toEqual({ ok: true });
  });

  test("bytes", async () => {
    const data = new Uint8Array([1, 2, 3]);
    const res = toResponse({
      kind: "bytes",
      status: 200,
      bytes: data,
      contentType: "application/octet-stream",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(data);
  });

  test("text with default content-type", async () => {
    const res = toResponse({ kind: "text", status: 200, text: "hi" });
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await res.text()).toBe("hi");
  });

  test("text with custom content-type", async () => {
    const res = toResponse({
      kind: "text",
      status: 200,
      text: "<p>",
      contentType: "text/html",
    });
    expect(res.headers.get("content-type")).toBe("text/html");
  });

  test("empty", async () => {
    const res = toResponse({ kind: "empty", status: 204 });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  test("empty with headers", async () => {
    // Discovery: in handler-response.ts the 'empty' case spreads
    // `r.headers` directly into the ResponseInit object instead of
    // into a `headers` property (compare with json/bytes/text which
    // do `headers: { ..., ...r.headers }`). Result: header values get
    // dropped silently and Response() likely ignores the unrecognized
    // ResponseInit keys. This is a real bug — logged in ideas.md.
    // For now this test pins the CURRENT (buggy) behavior so a fix
    // would intentionally break it and prompt updating both at once.
    const res = toResponse({
      kind: "empty",
      status: 200,
      headers: { "x-foo": "bar", "x-baz": "qux" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-foo")).toBeNull();
    expect(res.headers.get("x-baz")).toBeNull();
  });
});

describe("clientIpOf", () => {
  test("prefers cf-connecting-ip", () => {
    const req = new Request("http://x", {
      headers: {
        "cf-connecting-ip": "1.1.1.1",
        "x-forwarded-for": "2.2.2.2",
      },
    });
    expect(clientIpOf(req)).toBe("1.1.1.1");
  });

  test("falls back to first x-forwarded-for", () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "3.3.3.3, 4.4.4.4" },
    });
    expect(clientIpOf(req)).toBe("3.3.3.3");
  });

  test("falls back to x-real-ip", () => {
    const req = new Request("http://x", {
      headers: { "x-real-ip": "5.5.5.5" },
    });
    expect(clientIpOf(req)).toBe("5.5.5.5");
  });

  test("returns null when no headers present", () => {
    const req = new Request("http://x");
    expect(clientIpOf(req)).toBeNull();
  });
});
