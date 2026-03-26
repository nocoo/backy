import { describe, expect, test, beforeEach, mock } from "bun:test";
import { createZipBuffer, BACKUP_STUBS, R2_STUBS } from "./helpers";

// --- Mutable mock state ---

let mockGetBackupResult: Record<string, unknown> | undefined = {
  id: "backup-1",
  project_id: "proj-123",
  file_key: "backups/proj-123/2026-01-01.zip",
  json_key: null,
  is_single_json: 0,
  json_extracted: 0,
  file_type: "zip",
  file_size: 1000,
};

let mockDownloadBody: { transformToByteArray: () => Promise<Uint8Array> } | null = null;
let mockDownloadContentLength: number | undefined = 0;
const uploadCalls: Array<{ key: string; contentType: string }> = [];
const updateCalls: Array<{ id: string; data: Record<string, unknown> }> = [];

mock.module("@/lib/db/backups", () => ({
  ...BACKUP_STUBS,
  getBackup: async () => mockGetBackupResult,
  updateBackup: async (id: string, data: Record<string, unknown>) => {
    updateCalls.push({ id, data });
  },
}));

mock.module("@/lib/r2/client", () => ({
  ...R2_STUBS,
  downloadFromR2: async () => ({
    body: mockDownloadBody,
    contentType: "application/octet-stream",
    contentLength: mockDownloadContentLength,
  }),
  uploadToR2: async (key: string, _data: unknown, contentType: string) => {
    uploadCalls.push({ key, contentType });
  },
}));

// NOTE: No mock.module for extractors or storage — use the real modules
// to avoid polluting other test files via Bun's global mock.module behavior.

// Import AFTER mocks
const { POST } = await import("@/app/api/backups/[id]/extract/route");

// --- Helpers ---

function callPOST(id: string) {
  const req = new Request(`http://localhost:7026/api/backups/${id}/extract`, {
    method: "POST",
  });
  return POST(req, { params: Promise.resolve({ id }) });
}

describe("POST /api/backups/[id]/extract", () => {
  beforeEach(() => {
    mockGetBackupResult = {
      id: "backup-1",
      project_id: "proj-123",
      file_key: "backups/proj-123/2026-01-01.zip",
      json_key: null,
      is_single_json: 0,
      json_extracted: 0,
      file_type: "zip",
      file_size: 1000,
    };
    mockDownloadBody = null;
    mockDownloadContentLength = 0;
    uploadCalls.length = 0;
    updateCalls.length = 0;
  });

  test("returns 404 when backup not found", async () => {
    mockGetBackupResult = undefined;
    const res = await callPOST("nonexistent");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  test("returns 200 when json_key already exists", async () => {
    mockGetBackupResult!.json_key = "previews/proj-123/existing.json";
    const res = await callPOST("backup-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toContain("already available");
    expect(body.json_key).toBe("previews/proj-123/existing.json");
  });

  test("returns 400 when backup is single JSON", async () => {
    mockGetBackupResult!.is_single_json = 1;
    const res = await callPOST("backup-1");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("already a JSON");
  });

  test("returns 400 for unknown/non-extractable file type", async () => {
    mockGetBackupResult!.file_type = "unknown";
    const res = await callPOST("backup-1");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("not available");
  });

  test("returns 400 for json file type (not extractable)", async () => {
    mockGetBackupResult!.file_type = "json";
    const res = await callPOST("backup-1");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("not available");
  });

  test("returns 500 when R2 download has no body", async () => {
    mockDownloadBody = null;
    const res = await callPOST("backup-1");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("download");
  });

  test("extracts JSON from ZIP successfully", async () => {
    const zipData = await createZipBuffer({ "data.json": '{"hello":"world"}' });
    mockDownloadBody = {
      transformToByteArray: async () => zipData,
    };

    const res = await callPOST("backup-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toContain("extracted successfully");
    expect(body.json_key).toContain("previews/proj-123/");
    expect(body.source_file).toBe("data.json");
    expect(body.json_files_found).toBe(1);

    // Should upload the preview JSON to R2
    expect(uploadCalls).toHaveLength(1);
    expect(uploadCalls[0]!.key).toContain("previews/proj-123/");
    expect(uploadCalls[0]!.contentType).toBe("application/json");

    // Should update the backup record
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]!.id).toBe("backup-1");
    expect(updateCalls[0]!.data.jsonExtracted).toBe(true);
    expect(updateCalls[0]!.data.jsonKey).toContain("previews/proj-123/");
  });

  test("returns 400 when ZIP has no JSON files", async () => {
    const zipData = await createZipBuffer({ "readme.txt": "hello" });
    mockDownloadBody = {
      transformToByteArray: async () => zipData,
    };

    const res = await callPOST("backup-1");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("No JSON files");
  });

  test("returns 400 when ZIP contains invalid JSON", async () => {
    const zipData = await createZipBuffer({ "bad.json": "not valid json {{{" });
    mockDownloadBody = {
      transformToByteArray: async () => zipData,
    };

    const res = await callPOST("backup-1");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("not valid JSON");
  });

  test("extracts JSON from GZ file type", async () => {
    // Create a real gzipped JSON buffer
    const { gzip } = await import("node:zlib");
    const { promisify } = await import("node:util");
    const gzipAsync = promisify(gzip);
    const gzData = await gzipAsync(Buffer.from('{"gz":"test"}'));

    mockGetBackupResult!.file_type = "gz";
    mockGetBackupResult!.file_key = "backups/proj-123/2026-01-01.gz";
    mockDownloadBody = {
      transformToByteArray: async () => new Uint8Array(gzData),
    };

    const res = await callPOST("backup-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toContain("extracted successfully");
    expect(body.source_file).toBe("decompressed.json");
  });

  test("returns 400 when GZ content is not JSON", async () => {
    const { gzip } = await import("node:zlib");
    const { promisify } = await import("node:util");
    const gzipAsync = promisify(gzip);
    const gzData = await gzipAsync(Buffer.from("not json content"));

    mockGetBackupResult!.file_type = "gz";
    mockDownloadBody = {
      transformToByteArray: async () => new Uint8Array(gzData),
    };

    const res = await callPOST("backup-1");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("not valid JSON");
  });

  test("returns 400 when R2 archive exceeds decompression size limit", async () => {
    // Simulate R2 object larger than MAX_DECOMPRESSED_SIZE (50MB)
    mockDownloadContentLength = 100 * 1024 * 1024; // 100MB
    mockDownloadBody = {
      transformToByteArray: async () => new Uint8Array(0),
    };

    const res = await callPOST("backup-1");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("too large");
    expect(body.error).toContain("limit");
  });
});
