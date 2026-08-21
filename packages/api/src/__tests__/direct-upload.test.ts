import { describe, expect, test } from "vitest";
import {
  MAX_DIRECT_BYTES,
  directExtension,
  generateDirectFinalKey,
  generateDirectStagingKey,
  isDirectFinalKey,
  unixNow,
  utf8ByteLength,
  validateFileName,
} from "../lib/direct-upload";

describe("direct upload keys", () => {
  test("staging and final keys use upload id and .bin for unknown", () => {
    expect(directExtension("unknown", "dump.sql")).toBe(".bin");
    expect(directExtension("gz", "dump.tar.gz")).toBe(".gz");
    expect(generateDirectStagingKey("proj", "upl", ".bin")).toBe(
      "direct-staging/proj/upl/in.bin",
    );
    expect(generateDirectFinalKey("proj", "upl", ".bin")).toBe(
      "backups/proj/direct/upl.bin",
    );
    expect(isDirectFinalKey("backups/proj/direct/upl.bin")).toBe(true);
    expect(isDirectFinalKey("backups/proj/2026-01-01T00-00-00-000Z.zip")).toBe(
      false,
    );
  });

  test("unixNow is seconds and utf8ByteLength counts bytes", () => {
    expect(unixNow(1_700_000_000_500)).toBe(1_700_000_000);
    expect(utf8ByteLength("é")).toBe(2);
    expect(MAX_DIRECT_BYTES).toBe(5_000_000_000);
  });

  test("validateFileName rejects path characters and empty names", () => {
    expect(validateFileName("dump.tar.gz")).toBeNull();
    expect(validateFileName("")).toMatch(/required/);
    expect(validateFileName("a".repeat(256))).toMatch(/required/);
    expect(validateFileName("a/b")).toMatch(/basename/);
    expect(validateFileName("a\\b")).toMatch(/basename/);
    expect(validateFileName("a..b")).toMatch(/basename/);
    expect(validateFileName("a\0b")).toMatch(/basename/);
    expect(validateFileName(1)).toMatch(/required/);
  });
});
