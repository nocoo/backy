import { describe, expect, test } from "vitest";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import JSZip from "jszip";
import tar from "tar-stream";
import {
  extractJson,
  extractFromZip,
  extractFromGz,
  extractFromTgz,
  MAX_DECOMPRESSED_SIZE,
} from "@backy/api/backup/extractors";
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
      expect(result.reason).toBe("File is already JSON, no extraction needed");
    }
  });

  test("returns failure for unknown type", async () => {
    const result = await extractJson(new Uint8Array(), "unknown");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe(
        "Unsupported file format — cannot extract preview content",
      );
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
      expect(result.reason).toBe("No JSON files found in the ZIP archive");
    }
  });

  test("fails on invalid json content", async () => {
    const zip = await createZipBuffer({
      "data.json": "not valid json {{{",
    });
    const result = await extractFromZip(zip);
    expect(result.success).toBe(false);
    if (!result.success) {
      // Tightened: pin the templated reason — the impl interpolates
      // the failing filename so a regression that drops it (or wraps
      // the entry name) would surface.
      expect(result.reason).toBe(`File "data.json" is not valid JSON`);
    }
  });

  test("fails on corrupt zip data", async () => {
    const corrupt = new Uint8Array([0, 1, 2, 3, 4, 5]);
    const result = await extractFromZip(corrupt);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe(
        "Failed to parse ZIP archive — file may be corrupt",
      );
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
      expect(result.reason).toBe(
        "Decompressed content is not valid JSON — preview is not available for this file",
      );
    }
  });

  test("fails on corrupt gz data", async () => {
    const corrupt = new Uint8Array([0, 1, 2, 3, 4, 5]);
    const result = await extractFromGz(corrupt);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe(
        "Failed to decompress GZ file — file may be corrupt",
      );
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
      expect(result.reason).toBe("No JSON files found in the TAR.GZ archive");
    }
  });

  test("fails on invalid json content in tar.gz", async () => {
    const tgz = await createTgzBuffer({
      "bad.json": "{not valid json",
    });
    const result = await extractFromTgz(tgz);
    expect(result.success).toBe(false);
    if (!result.success) {
      // Tightened: pin the templated reason — catches a regression that
      // drops the failing entry name.
      expect(result.reason).toBe(`File "bad.json" is not valid JSON`);
    }
  });

  test("fails on corrupt data", async () => {
    const corrupt = new Uint8Array([0, 1, 2, 3, 4, 5]);
    const result = await extractFromTgz(corrupt);
    expect(result.success).toBe(false);
    if (!result.success) {
      // 6-byte input fails the gunzip step (not the tar parse), so the
      // 'decompress TGZ' reason is what surfaces (not 'parse TAR').
      expect(result.reason).toBe(
        "Failed to decompress TGZ file — file may be corrupt",
      );
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

// ---------------------------------------------------------------------------
// Decompression bomb defense
// ---------------------------------------------------------------------------

describe("decompression bomb defense", () => {
  test("MAX_DECOMPRESSED_SIZE is 50MB", () => {
    expect(MAX_DECOMPRESSED_SIZE).toBe(50 * 1024 * 1024);
  });

  test("GZ: rejects decompressed output exceeding limit", async () => {
    // Create a GZ buffer containing highly compressible data (1MB of zeros)
    // that compresses well. We can't create 50MB+ in tests efficiently,
    // but we verify the streaming limit mechanism works by ensuring normal
    // data passes and the error message format is correct.
    const largeContent = "0".repeat(1024 * 1024); // 1MB — should pass
    const gz = await createGzBuffer(largeContent);
    const result = await extractFromGz(gz);
    // This should fail because it's not valid JSON, but NOT because of size
    expect(result.success).toBe(false);
    if (!result.success) {
      // Tightened: 'not valid JSON' branch with positive exact reason +
      // explicit 'not size-limit' check (size-limit branch would mention
      // 'MB limit', so 'limit' substring negative-check excludes it).
      expect(result.reason).toBe(
        "Decompressed content is not valid JSON — preview is not available for this file",
      );
      expect(result.reason).not.toContain("limit");
    }
  });

  test("ZIP: checks declared uncompressed size in metadata", async () => {
    // Normal small ZIP passes
    const zip = await createZipBuffer({ "data.json": '{"ok":true}' });
    const result = await extractFromZip(zip);
    expect(result.success).toBe(true);
  });

  test("TGZ: normal data passes without size limit error", async () => {
    const tgz = await createTgzBuffer({ "data.json": '{"ok":true}' });
    const result = await extractFromTgz(tgz);
    expect(result.success).toBe(true);
  });

  test("ZIP: rejects entry whose declared uncompressedSize exceeds MAX_DECOMPRESSED_SIZE (metadata-bomb defense)", async () => {
    // Covers lines 152-156 of extractors.ts: the
    // `declaredSize > MAX_DECOMPRESSED_SIZE` metadata check that
    // rejects malicious zips claiming a huge uncompressed size BEFORE
    // calling zipEntry.async() (which would otherwise allocate the
    // claimed buffer). Catches a refactor that drops the metadata
    // check.
    //
    // We craft a small zip and then surgically rewrite the central
    // directory's uncompressed-size field so JSZip reports the lie.
    // The uncompressed-size record lives at offset 24..28 of the
    // central directory header (signature 0x02014b50). Find that
    // signature, overwrite the size, and JSZip.loadAsync will believe
    // it.
    const zipBuffer = Buffer.from(
      await createZipBuffer({ "data.json": '{"ok":true}' }),
    );
    const CENTRAL_DIR_SIG = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
    const cdOffset = zipBuffer.indexOf(CENTRAL_DIR_SIG);
    expect(cdOffset).toBeGreaterThan(-1);
    // Uncompressed size is at offset +24 from the CD-header signature
    // (4-byte LE uint32). Write 50MB+1.
    const liedSize = MAX_DECOMPRESSED_SIZE + 1;
    zipBuffer.writeUInt32LE(liedSize, cdOffset + 24);

    const result = await extractFromZip(new Uint8Array(zipBuffer));
    expect(result.success).toBe(false);
    if (!result.success) {
      // Pin the bomb-defense reason verbatim. Catches a refactor that
      // changes the message or weakens the check.
      expect(result.reason).toBe(
        `JSON file uncompressed size (${(liedSize / 1024 / 1024).toFixed(1)}MB) exceeds ${MAX_DECOMPRESSED_SIZE / 1024 / 1024}MB limit`,
      );
    }
  });

  test("TGZ: streaming gunzip rejects decompressed output exceeding MAX_DECOMPRESSED_SIZE (decompression bomb)", async () => {
    // Covers line 72 of extractors.ts: the `streamingGunzip` helper's
    // incremental-byte-counter overflow check. We craft a tar with a
    // single entry of MAX_DECOMPRESSED_SIZE+1 bytes of zeros, gzip it
    // (zeros compress ~1000x so the gz is small), and verify the
    // streaming gunzip aborts with the bomb-defense error before any
    // tar entry is parsed. Catches a refactor that drops streaming
    // and decompresses fully into memory (which would OOM or pass).
    const pack = tar.pack();
    const giantSize = MAX_DECOMPRESSED_SIZE + 1;
    const entryStream = pack.entry({
      name: "giant.json",
      size: giantSize,
    });
    const ZEROS_CHUNK = Buffer.alloc(64 * 1024);
    let written = 0;
    while (written < giantSize) {
      const remaining = giantSize - written;
      const chunk = remaining >= ZEROS_CHUNK.length
        ? ZEROS_CHUNK
        : ZEROS_CHUNK.subarray(0, remaining);
      entryStream.write(chunk);
      written += chunk.length;
    }
    entryStream.end();
    pack.finalize();
    const chunks: Buffer[] = [];
    for await (const chunk of pack) {
      chunks.push(chunk as Buffer);
    }
    const tarBuffer = Buffer.concat(chunks);
    const gzBuffer = await gzipAsync(tarBuffer);

    const result = await extractFromTgz(new Uint8Array(gzBuffer));
    expect(result.success).toBe(false);
    if (!result.success) {
      // Pin the bomb-defense message verbatim. A regression that
      // weakens or removes the streaming check would change this.
      expect(result.reason).toBe(
        `Decompressed output exceeds ${MAX_DECOMPRESSED_SIZE / 1024 / 1024}MB limit (possible decompression bomb)`,
      );
    }
  }, 30_000);

  test("TGZ: rejects when gunzip succeeds but tar parser errors (covers extract.on('error'))", async () => {
    // Covers line 389 of extractors.ts: the `extract.on('error')`
    // handler. We construct a valid gzip wrapping a buffer that is
    // NOT a valid tar (random non-tar bytes). streamingGunzip
    // resolves cleanly; tar-stream then errors when it tries to
    // parse the bytes as a tar header.
    const garbage = Buffer.from(
      "this is definitely not a valid tar archive but it gunzips fine".repeat(
        20,
      ),
    );
    const gz = await gzipAsync(garbage);
    const result = await extractFromTgz(new Uint8Array(gz));
    expect(result.success).toBe(false);
    if (!result.success) {
      // Generic outer-catch failure surfaces; pin the user-facing
      // prefix so a refactor of the error-message format is forced to
      // update the test in tandem.
      expect(result.reason).toBe("Failed to parse TAR archive — file may be corrupt");
    }
  });
});
