import { describe, expect, test } from "bun:test";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import JSZip from "jszip";
import tar from "tar-stream";
import {
  extractJson,
  extractFromZip,
  extractFromGz,
  extractFromTgz,
} from "@/lib/backup/extractors";
import { createZipBuffer } from "./helpers";

const gzipAsync = promisify(gzip);

// ---------------------------------------------------------------------------
// Helpers: create test fixtures in memory
// ---------------------------------------------------------------------------

/** Create a GZ buffer from a string. */
async function createGzBuffer(content: string): Promise<Uint8Array> {
  const buf = await gzipAsync(Buffer.from(content, "utf-8"));
  return new Uint8Array(buf);
}

/** Create a TAR.GZ buffer containing given files. */
async function createTgzBuffer(
  files: Record<string, string>,
): Promise<Uint8Array> {
  const pack = tar.pack();
  for (const [name, content] of Object.entries(files)) {
    pack.entry({ name, size: Buffer.byteLength(content) }, content);
  }
  pack.finalize();

  // Collect tar buffer
  const chunks: Buffer[] = [];
  for await (const chunk of pack) {
    chunks.push(chunk as Buffer);
  }
  const tarBuffer = Buffer.concat(chunks);
  const gzBuffer = await gzipAsync(tarBuffer);
  return new Uint8Array(gzBuffer);
}

// ---------------------------------------------------------------------------
// extractJson (dispatch)
// ---------------------------------------------------------------------------

describe("extractJson", () => {
  test("dispatches to zip strategy", async () => {
    const zip = await createZipBuffer({ "data.json": '{"ok":true}' });
    const result = await extractJson(zip, "zip");
    expect(result.success).toBe(true);
  });

  test("dispatches to gz strategy", async () => {
    const gz = await createGzBuffer('{"ok":true}');
    const result = await extractJson(gz, "gz");
    expect(result.success).toBe(true);
  });

  test("dispatches to tgz strategy", async () => {
    const tgz = await createTgzBuffer({ "data.json": '{"ok":true}' });
    const result = await extractJson(tgz, "tgz");
    expect(result.success).toBe(true);
  });

  test("returns failure for json type", async () => {
    const result = await extractJson(new Uint8Array(), "json");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toContain("already JSON");
    }
  });

  test("returns failure for unknown type", async () => {
    const result = await extractJson(new Uint8Array(), "unknown");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toContain("Unsupported");
    }
  });
});

// ---------------------------------------------------------------------------
// extractFromZip
// ---------------------------------------------------------------------------

describe("extractFromZip", () => {
  test("extracts first json file alphabetically", async () => {
    const zip = await createZipBuffer({
      "b.json": '{"b":1}',
      "a.json": '{"a":1}',
      "readme.txt": "hello",
    });
    const result = await extractFromZip(zip);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.sourceFile).toBe("a.json");
      expect(result.jsonFilesFound).toBe(2);
      const parsed = JSON.parse(new TextDecoder().decode(result.jsonContent));
      expect(parsed).toEqual({ a: 1 });
    }
  });

  test("fails when no json files in zip", async () => {
    const zip = await createZipBuffer({
      "readme.txt": "hello",
      "data.csv": "a,b,c",
    });
    const result = await extractFromZip(zip);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toContain("No JSON files");
    }
  });

  test("fails on invalid json content", async () => {
    const zip = await createZipBuffer({
      "data.json": "not valid json {{{",
    });
    const result = await extractFromZip(zip);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toContain("not valid JSON");
    }
  });

  test("fails on corrupt zip data", async () => {
    const corrupt = new Uint8Array([0, 1, 2, 3, 4, 5]);
    const result = await extractFromZip(corrupt);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toContain("corrupt");
    }
  });

  test("skips directory entries", async () => {
    const zip = new JSZip();
    zip.folder("subdir");
    zip.file("subdir/data.json", '{"nested":true}');
    const buffer = await zip.generateAsync({ type: "uint8array" });

    const result = await extractFromZip(buffer);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.sourceFile).toBe("subdir/data.json");
    }
  });
});

// ---------------------------------------------------------------------------
// extractFromGz
// ---------------------------------------------------------------------------

describe("extractFromGz", () => {
  test("extracts valid json from gz", async () => {
    const gz = await createGzBuffer('{"hello":"world"}');
    const result = await extractFromGz(gz);
    expect(result.success).toBe(true);
    if (result.success) {
      const parsed = JSON.parse(new TextDecoder().decode(result.jsonContent));
      expect(parsed).toEqual({ hello: "world" });
      expect(result.sourceFile).toBe("decompressed.json");
      expect(result.jsonFilesFound).toBe(1);
    }
  });

  test("fails when decompressed content is not json", async () => {
    const gz = await createGzBuffer("SELECT * FROM users;");
    const result = await extractFromGz(gz);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toContain("not valid JSON");
    }
  });

  test("fails on corrupt gz data", async () => {
    const corrupt = new Uint8Array([0, 1, 2, 3, 4, 5]);
    const result = await extractFromGz(corrupt);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toContain("corrupt");
    }
  });

  test("handles json arrays", async () => {
    const gz = await createGzBuffer('[1, 2, 3]');
    const result = await extractFromGz(gz);
    expect(result.success).toBe(true);
    if (result.success) {
      const parsed = JSON.parse(new TextDecoder().decode(result.jsonContent));
      expect(parsed).toEqual([1, 2, 3]);
    }
  });
});

// ---------------------------------------------------------------------------
// extractFromTgz
// ---------------------------------------------------------------------------

describe("extractFromTgz", () => {
  test("extracts first json file alphabetically from tar.gz", async () => {
    const tgz = await createTgzBuffer({
      "z.json": '{"z":1}',
      "a.json": '{"a":1}',
      "readme.txt": "hello",
    });
    const result = await extractFromTgz(tgz);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.sourceFile).toBe("a.json");
      expect(result.jsonFilesFound).toBe(2);
      const parsed = JSON.parse(new TextDecoder().decode(result.jsonContent));
      expect(parsed).toEqual({ a: 1 });
    }
  });

  test("fails when no json files in tar.gz", async () => {
    const tgz = await createTgzBuffer({
      "data.csv": "a,b,c",
      "readme.md": "# hello",
    });
    const result = await extractFromTgz(tgz);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toContain("No JSON files");
    }
  });

  test("fails on invalid json content in tar.gz", async () => {
    const tgz = await createTgzBuffer({
      "bad.json": "{not valid json",
    });
    const result = await extractFromTgz(tgz);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toContain("not valid JSON");
    }
  });

  test("fails on corrupt data", async () => {
    const corrupt = new Uint8Array([0, 1, 2, 3, 4, 5]);
    const result = await extractFromTgz(corrupt);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toContain("corrupt");
    }
  });

  test("handles nested paths in tar entries", async () => {
    const tgz = await createTgzBuffer({
      "backup/config/settings.json": '{"nested":"path"}',
    });
    const result = await extractFromTgz(tgz);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.sourceFile).toBe("backup/config/settings.json");
    }
  });
});
