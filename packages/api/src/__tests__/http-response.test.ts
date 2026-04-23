import { describe, expect, test } from "bun:test";
import { json, empty, bytes, text } from "../http/response";

describe("HandlerResponse constructors", () => {
  test("json without headers", () => {
    const r = json(200, { a: 1 });
    expect(r).toEqual({ kind: "json", status: 200, body: { a: 1 } });
  });

  test("json with headers", () => {
    const r = json(201, { a: 1 }, { "x-foo": "bar" });
    expect(r).toEqual({
      kind: "json",
      status: 201,
      body: { a: 1 },
      headers: { "x-foo": "bar" },
    });
  });

  test("empty without headers", () => {
    expect(empty(204)).toEqual({ kind: "empty", status: 204 });
  });

  test("empty with headers", () => {
    expect(empty(200, { "x-y": "z" })).toEqual({
      kind: "empty",
      status: 200,
      headers: { "x-y": "z" },
    });
  });

  test("bytes default content type", () => {
    const data = new Uint8Array([1, 2, 3]);
    const r = bytes(200, data, "application/octet-stream");
    expect(r).toEqual({
      kind: "bytes",
      status: 200,
      bytes: data,
      contentType: "application/octet-stream",
    });
  });

  test("bytes with headers", () => {
    const data = new Uint8Array([0]);
    const r = bytes(200, data, "image/png", { "x-cache": "miss" });
    expect(r).toEqual({
      kind: "bytes",
      status: 200,
      bytes: data,
      contentType: "image/png",
      headers: { "x-cache": "miss" },
    });
  });

  test("text without options", () => {
    expect(text(200, "hello")).toEqual({
      kind: "text",
      status: 200,
      text: "hello",
    });
  });

  test("text with content type and headers", () => {
    expect(text(200, "ok", "text/plain", { "x-a": "b" })).toEqual({
      kind: "text",
      status: 200,
      text: "ok",
      contentType: "text/plain",
      headers: { "x-a": "b" },
    });
  });
});
