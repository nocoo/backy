import { describe, expect, test, vi } from "vitest";
import {
  CopyObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createS3R2Adapter, isS3R2Configured } from "../lib/r2/s3-adapter";

const env = {
  R2_ACCESS_KEY_ID: "id",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_ACCOUNT_ID: "acct",
  R2_BUCKET_NAME: "bucket",
};

describe("isS3R2Configured", () => {
  test("requires all four credential fields", () => {
    expect(isS3R2Configured({})).toBe(false);
    expect(isS3R2Configured(env)).toBe(true);
  });
});

describe("createS3R2Adapter", () => {
  test("presignUpload signs content-type, content-length, if-none-match", async () => {
    const adapter = createS3R2Adapter(env);
    const url = await adapter.presignUpload("direct-staging/p/u/in.bin", 3600, {
      contentType: "application/gzip",
      contentLength: 1024,
    });
    const parsed = new URL(url);
    expect(parsed.host).toBe("bucket.acct.r2.cloudflarestorage.com");
    const signed = parsed.searchParams.get("X-Amz-SignedHeaders") ?? "";
    expect(signed.split(";").sort()).toEqual(
      ["content-length", "content-type", "host", "if-none-match"].sort(),
    );
    expect(signed).not.toMatch(/checksum/i);
    expect(parsed.search).not.toMatch(/checksum/i);
    expect(parsed.searchParams.get("X-Amz-Expires")).toBe("3600");
  });

  test("rewrites presign origin when sign endpoint differs from API endpoint", async () => {
    const adapter = createS3R2Adapter({
      ...env,
      R2_S3_ENDPOINT: "http://127.0.0.1:17018/cdn-cgi/local/r2/s3",
      R2_S3_SIGN_ENDPOINT: "http://backy.hexly.ai/cdn-cgi/local/r2/s3",
    });
    const url = await adapter.presignUpload("k.bin", 60, {
      contentType: "application/octet-stream",
      contentLength: 1,
    });
    expect(url).toContain("http://127.0.0.1:17018/cdn-cgi/local/r2/s3/bucket/k.bin");
    expect(url).toContain("X-Amz-SignedHeaders=");
  });

  test("uses path-style local endpoint when R2_S3_ENDPOINT is set", async () => {
    const adapter = createS3R2Adapter({
      ...env,
      R2_S3_ENDPOINT: "http://127.0.0.1:17018/cdn-cgi/local/r2/s3",
    });
    const url = await adapter.presignUpload("k.bin", 60, {
      contentType: "application/octet-stream",
      contentLength: 1,
    });
    expect(url).toContain(
      "http://127.0.0.1:17018/cdn-cgi/local/r2/s3/bucket/k.bin",
    );
    expect(url).not.toContain("backy.hexly.ai");
  });

  test("head returns null on 404 and metadata on success", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockImplementation(
      async (command: unknown) => {
        if (command instanceof HeadObjectCommand) {
          if (command.input.Key === "missing") {
            throw Object.assign(new Error("missing"), {
              name: "NotFound",
              $metadata: { httpStatusCode: 404 },
            });
          }
          if (command.input.Key === "nosuch") {
            throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
          }
          if (command.input.Key === "boom") {
            throw new Error("network");
          }
          if (command.input.Key === "str") {
            throw "fail";
          }
          if (command.input.Key === "http404") {
            throw Object.assign(new Error("missing"), {
              $metadata: { httpStatusCode: 404 },
            });
          }
          return { ContentLength: 12, ContentType: "application/gzip" };
        }
        throw new Error("unexpected");
      },
    );
    try {
      const adapter = createS3R2Adapter(env);
      expect(await adapter.head("missing")).toBeNull();
      expect(await adapter.head("nosuch")).toBeNull();
      await expect(adapter.head("present")).resolves.toEqual({
        contentLength: 12,
        contentType: "application/gzip",
      });
      await expect(adapter.head("boom")).rejects.toThrow("network");
      await expect(adapter.head("str")).rejects.toBe("fail");
      expect(await adapter.head("http404")).toBeNull();
    } finally {
      send.mockRestore();
    }
  });

  test("copy treats Workers DOMParser 200 as success", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockRejectedValue(
      Object.assign(new ReferenceError("DOMParser is not defined"), {
        $metadata: { httpStatusCode: 200 },
      }),
    );
    try {
      const adapter = createS3R2Adapter(env);
      await expect(adapter.copy("src", "dst")).resolves.toBeUndefined();
    } finally {
      send.mockRestore();
    }
  });

  test("copy sends CopyObjectCommand source to dest", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
    try {
      const adapter = createS3R2Adapter(env);
      await adapter.copy("src-key", "dst-key");
      expect(send).toHaveBeenCalledTimes(1);
      const cmd = send.mock.calls[0]?.[0];
      expect(cmd).toBeInstanceOf(CopyObjectCommand);
      expect((cmd as CopyObjectCommand).input).toEqual({
        Bucket: "bucket",
        CopySource: "bucket/src-key",
        Key: "dst-key",
      });
    } finally {
      send.mockRestore();
    }
  });

  test("head defaults contentLength to 0 when ContentLength omitted", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
    try {
      const adapter = createS3R2Adapter(env);
      await expect(adapter.head("empty")).resolves.toEqual({ contentLength: 0 });
    } finally {
      send.mockRestore();
    }
  });

  test("put/get/delete/ping/presignDownload talk to S3", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockImplementation(
      async (command: unknown) => {
        const name = (command as { constructor: { name: string } }).constructor
          .name;
        if (name === "GetObjectCommand") {
          return {
            Body: { transformToByteArray: async () => new Uint8Array([1, 2]) },
            ContentType: "text/plain",
            ContentLength: 2,
          };
        }
        return {};
      },
    );
    try {
      const adapter = createS3R2Adapter(env);
      await adapter.put("k", new ArrayBuffer(2), { contentType: "text/plain" });
      await adapter.put("k2", new Uint8Array([9]));
      const got = await adapter.get("k");
      expect(got?.contentLength).toBe(2);
      expect(await got?.bytes()).toEqual(new Uint8Array([1, 2]));
      await adapter.delete("k");
      await adapter.ping();
      const url = await adapter.presignDownload("k", 15);
      expect(url).toContain("X-Amz-Expires=15");
    } finally {
      send.mockRestore();
    }
  });

  test("get throws when body has no transformToByteArray", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({
      Body: {},
    } as never);
    try {
      const adapter = createS3R2Adapter(env);
      const got = await adapter.get("k");
      await expect(got?.bytes()).rejects.toThrow(/transformToByteArray/);
    } finally {
      send.mockRestore();
    }
  });

  test("throws when R2 credentials are missing", async () => {
    const adapter = createS3R2Adapter({});
    await expect(adapter.ping()).rejects.toThrow(/Missing R2 configuration/);
  });

  test("get omits metadata when S3 response has no Body", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
    try {
      const adapter = createS3R2Adapter(env);
      const got = await adapter.get("k");
      expect(got?.body).toBeNull();
      expect("contentType" in (got ?? {})).toBe(false);
      expect("contentLength" in (got ?? {})).toBe(false);
    } finally {
      send.mockRestore();
    }
  });
});
