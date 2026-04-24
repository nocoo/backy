import { describe, expect, test, mock } from "bun:test";
import {
  createBindingR2Adapter,
  type R2Binding,
  type R2BindingObject,
  type R2BindingPutOptions,
} from "../lib/r2/binding-adapter";

interface PutCall {
  key: string;
  body: unknown;
  options?: R2BindingPutOptions;
}

function makeBucket(overrides: Partial<R2Binding> = {}): {
  bucket: R2Binding;
  puts: PutCall[];
  deletes: string[];
  heads: string[];
} {
  const puts: PutCall[] = [];
  const deletes: string[] = [];
  const heads: string[] = [];
  const bucket: R2Binding = {
    async put(key, body, options) {
      puts.push({ key, body, ...(options !== undefined && { options }) });
    },
    async get() {
      return null;
    },
    async delete(key) {
      deletes.push(key);
    },
    async head(key) {
      heads.push(key);
      return null;
    },
    ...overrides,
  };
  return { bucket, puts, deletes, heads };
}

describe("createBindingR2Adapter", () => {
  test("put forwards ArrayBuffer with contentType", async () => {
    const { bucket, puts } = makeBucket();
    const adapter = createBindingR2Adapter(bucket);
    const buf = new ArrayBuffer(8);
    await adapter.put("k", buf, { contentType: "application/octet-stream" });
    expect(puts).toHaveLength(1);
    expect(puts[0]!.key).toBe("k");
    expect(puts[0]!.body).toBe(buf);
    expect(puts[0]!.options).toEqual({
      httpMetadata: { contentType: "application/octet-stream" },
    });
  });

  test("put forwards Uint8Array (ArrayBufferView) without options when no contentType", async () => {
    const { bucket, puts } = makeBucket();
    const adapter = createBindingR2Adapter(bucket);
    const u8 = new Uint8Array([1, 2, 3]);
    await adapter.put("k2", u8);
    expect(puts[0]!.body).toBe(u8);
    expect(puts[0]!.options).toEqual({});
  });

  test("put forwards ReadableStream", async () => {
    const { bucket, puts } = makeBucket();
    const adapter = createBindingR2Adapter(bucket);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0]));
        controller.close();
      },
    });
    await adapter.put("s", stream);
    expect(puts[0]!.body).toBe(stream);
  });

  test("get maps R2BindingObject to R2GetResult with full metadata", async () => {
    const bytes = new Uint8Array([7, 8, 9]);
    const obj: R2BindingObject = {
      body: null,
      arrayBuffer: async () =>
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
      httpMetadata: { contentType: "image/png" },
      size: 3,
    };
    const { bucket } = makeBucket({ get: async () => obj });
    const adapter = createBindingR2Adapter(bucket);
    const out = await adapter.get("k");
    expect(out).not.toBeNull();
    expect(out!.contentType).toBe("image/png");
    expect(out!.contentLength).toBe(3);
    expect(await out!.bytes()).toEqual(bytes);
  });

  test("get omits contentType/contentLength when binding object lacks them", async () => {
    const obj: R2BindingObject = {
      body: null,
      arrayBuffer: async () => new ArrayBuffer(0),
    };
    const { bucket } = makeBucket({ get: async () => obj });
    const adapter = createBindingR2Adapter(bucket);
    const out = await adapter.get("k");
    expect(out).not.toBeNull();
    expect("contentType" in out!).toBe(false);
    expect("contentLength" in out!).toBe(false);
  });

  test("get returns null when binding returns null", async () => {
    const { bucket } = makeBucket({ get: async () => null });
    const adapter = createBindingR2Adapter(bucket);
    expect(await adapter.get("missing")).toBeNull();
  });

  test("delete forwards key", async () => {
    const { bucket, deletes } = makeBucket();
    const adapter = createBindingR2Adapter(bucket);
    await adapter.delete("k");
    expect(deletes).toEqual(["k"]);
  });

  test("presignDownload throws when no presigner is wired", async () => {
    const { bucket } = makeBucket();
    const adapter = createBindingR2Adapter(bucket);
    await expect(adapter.presignDownload("k", 60)).rejects.toThrow(
      /no presignDownload implementation/,
    );
  });

  test("presignDownload delegates to options when provided", async () => {
    const { bucket } = makeBucket();
    const presign = mock(async (key: string, ttl: number) => `signed:${key}:${ttl}`);
    const adapter = createBindingR2Adapter(bucket, { presignDownload: presign });
    const url = await adapter.presignDownload("file.bin", 120);
    expect(url).toBe("signed:file.bin:120");
    expect(presign).toHaveBeenCalledTimes(1);
  });

  test("ping issues HEAD on sentinel key", async () => {
    const { bucket, heads } = makeBucket();
    const adapter = createBindingR2Adapter(bucket);
    await adapter.ping();
    expect(heads).toEqual(["__healthcheck__"]);
  });
});
