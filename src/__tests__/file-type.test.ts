import { describe, expect, test } from "bun:test";
import {
  detectFileType,
  getStorageExtension,
  isPreviewable,
  isExtractable,
  normalizeContentType,
} from "@/lib/backup/file-type";

// ---------------------------------------------------------------------------
// detectFileType
// ---------------------------------------------------------------------------

describe("detectFileType", () => {
  describe("extension-based detection", () => {
    test("detects .json files", () => {
      expect(detectFileType("backup.json", "application/octet-stream")).toBe("json");
    });

    test("detects .zip files", () => {
      expect(detectFileType("backup.zip", "application/octet-stream")).toBe("zip");
    });

    test("detects .gz files", () => {
      expect(detectFileType("backup.gz", "application/octet-stream")).toBe("gz");
    });

    test("detects .tar.gz files", () => {
      expect(detectFileType("backup.tar.gz", "application/octet-stream")).toBe("tgz");
    });

    test("detects .tgz files", () => {
      expect(detectFileType("backup.tgz", "application/octet-stream")).toBe("tgz");
    });

    test("is case-insensitive for extensions", () => {
      expect(detectFileType("BACKUP.JSON", "application/octet-stream")).toBe("json");
      expect(detectFileType("data.ZIP", "application/octet-stream")).toBe("zip");
      expect(detectFileType("data.GZ", "application/octet-stream")).toBe("gz");
      expect(detectFileType("data.TAR.GZ", "application/octet-stream")).toBe("tgz");
      expect(detectFileType("data.TGZ", "application/octet-stream")).toBe("tgz");
    });

    test("handles double extensions like .sql.gz as gz", () => {
      expect(detectFileType("dump.sql.gz", "application/octet-stream")).toBe("gz");
    });

    test("tar.gz takes priority over plain .gz", () => {
      // .tar.gz must be checked before .gz
      expect(detectFileType("archive.tar.gz", "application/gzip")).toBe("tgz");
    });
  });

  describe("content-type fallback", () => {
    test("falls back to application/json", () => {
      expect(detectFileType("backup", "application/json")).toBe("json");
    });

    test("falls back to application/zip", () => {
      expect(detectFileType("backup", "application/zip")).toBe("zip");
    });

    test("falls back to application/x-zip-compressed", () => {
      expect(detectFileType("backup", "application/x-zip-compressed")).toBe("zip");
    });

    test("falls back to application/gzip", () => {
      expect(detectFileType("backup", "application/gzip")).toBe("gz");
    });

    test("falls back to application/x-gzip", () => {
      expect(detectFileType("backup", "application/x-gzip")).toBe("gz");
    });

    test("strips charset params from content type", () => {
      expect(detectFileType("backup", "application/json; charset=utf-8")).toBe("json");
    });
  });

  describe("unknown types", () => {
    test("returns unknown for unrecognized extension and content type", () => {
      expect(detectFileType("backup.sql", "application/octet-stream")).toBe("unknown");
    });

    test("returns unknown for no extension and octet-stream", () => {
      expect(detectFileType("backup", "application/octet-stream")).toBe("unknown");
    });

    test("returns unknown for .bak files", () => {
      expect(detectFileType("data.bak", "application/octet-stream")).toBe("unknown");
    });

    test("returns unknown for .csv files", () => {
      expect(detectFileType("export.csv", "text/csv")).toBe("unknown");
    });

    test("returns unknown for .xml files", () => {
      expect(detectFileType("config.xml", "application/xml")).toBe("unknown");
    });
  });

  describe("extension takes priority over content type", () => {
    test(".json extension overrides gzip content type", () => {
      expect(detectFileType("data.json", "application/gzip")).toBe("json");
    });

    test(".zip extension overrides json content type", () => {
      expect(detectFileType("data.zip", "application/json")).toBe("zip");
    });

    test(".gz extension overrides json content type", () => {
      expect(detectFileType("data.gz", "application/json")).toBe("gz");
    });
  });
});

// ---------------------------------------------------------------------------
// getStorageExtension
// ---------------------------------------------------------------------------

describe("getStorageExtension", () => {
  test("returns .json for json type", () => {
    expect(getStorageExtension("json", "backup.json")).toBe(".json");
  });

  test("returns .zip for zip type", () => {
    expect(getStorageExtension("zip", "backup.zip")).toBe(".zip");
  });

  test("returns .gz for gz type", () => {
    expect(getStorageExtension("gz", "dump.sql.gz")).toBe(".gz");
  });

  test("returns .tar.gz for tgz type", () => {
    expect(getStorageExtension("tgz", "backup.tar.gz")).toBe(".tar.gz");
  });

  test("preserves original extension for unknown type", () => {
    expect(getStorageExtension("unknown", "data.sql")).toBe(".sql");
    expect(getStorageExtension("unknown", "backup.bak")).toBe(".bak");
    expect(getStorageExtension("unknown", "export.csv")).toBe(".csv");
  });

  test("returns empty string for unknown type with no extension", () => {
    expect(getStorageExtension("unknown", "backup")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// isPreviewable
// ---------------------------------------------------------------------------

describe("isPreviewable", () => {
  test("json is previewable", () => {
    expect(isPreviewable("json")).toBe(true);
  });

  test("zip is not previewable", () => {
    expect(isPreviewable("zip")).toBe(false);
  });

  test("gz is not previewable", () => {
    expect(isPreviewable("gz")).toBe(false);
  });

  test("tgz is not previewable", () => {
    expect(isPreviewable("tgz")).toBe(false);
  });

  test("unknown is not previewable", () => {
    expect(isPreviewable("unknown")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isExtractable
// ---------------------------------------------------------------------------

describe("isExtractable", () => {
  test("zip is extractable", () => {
    expect(isExtractable("zip")).toBe(true);
  });

  test("gz is extractable", () => {
    expect(isExtractable("gz")).toBe(true);
  });

  test("tgz is extractable", () => {
    expect(isExtractable("tgz")).toBe(true);
  });

  test("json is not extractable", () => {
    expect(isExtractable("json")).toBe(false);
  });

  test("unknown is not extractable", () => {
    expect(isExtractable("unknown")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// normalizeContentType
// ---------------------------------------------------------------------------

describe("normalizeContentType", () => {
  test("strips charset parameter", () => {
    expect(normalizeContentType("application/json; charset=utf-8")).toBe("application/json");
  });

  test("lowercases the content type", () => {
    expect(normalizeContentType("Application/JSON")).toBe("application/json");
  });

  test("trims whitespace", () => {
    expect(normalizeContentType("  application/json  ")).toBe("application/json");
  });

  test("handles content type without parameters", () => {
    expect(normalizeContentType("application/gzip")).toBe("application/gzip");
  });
});
