import { describe, expect, test, beforeEach, mock } from "bun:test";
import { BACKUP_STUBS, R2_STUBS, makeBackup } from "./helpers";

// --- Mutable mock state ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockGetBackup: (...args: any[]) => Promise<any> = async () => undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockDownloadFromR2: (...args: any[]) => Promise<any> = async () => ({
  body: null,
  contentType: "application/octet-stream",
  contentLength: 0,
});

mock.module("@/lib/db/backups", () => ({
  ...BACKUP_STUBS,
  getBackup: (...args: unknown[]) => mockGetBackup(...args),
}));

mock.module("@/lib/r2/client", () => ({
  ...R2_STUBS,
  downloadFromR2: (...args: unknown[]) => mockDownloadFromR2(...args),
}));

const { GET } = await import("@/app/api/backups/[id]/preview/route");

// --- Helpers ---

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

/** Create a mock R2 body with transformToByteArray (SDK stream mixin). */
function makeR2Body(content: string) {
  return {
    body: {
      transformToByteArray: async () => new TextEncoder().encode(content),
    },
    contentType: "application/json",
    contentLength: content.length,
  };
}

describe("/api/backups/[id]/preview", () => {
  beforeEach(() => {
    mockGetBackup = async () => undefined;
    mockDownloadFromR2 = async () => ({ body: null, contentType: "application/octet-stream", contentLength: 0 });
  });

  test("returns parsed JSON content for preview", async () => {
    const backup = makeBackup({ json_key: "backups/proj-test/bk-test.json" });
    mockGetBackup = async () => backup;
    mockDownloadFromR2 = async () => makeR2Body(JSON.stringify({ foo: "bar" }));

    const res = await GET(new Request("http://localhost/api/backups/bk-test/preview"), makeParams("bk-test"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.backup_id).toBe("bk-test");
    expect(body.content).toEqual({ foo: "bar" });
    expect(body.json_key).toBe("backups/proj-test/bk-test.json");
  });

  test("returns 404 when backup not found", async () => {
    mockGetBackup = async () => undefined;

    const res = await GET(new Request("http://localhost/api/backups/missing/preview"), makeParams("missing"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Backup not found");
  });

  test("returns 404 when json_key is null", async () => {
    const backup = makeBackup({ json_key: null, is_single_json: 0 });
    mockGetBackup = async () => backup;

    const res = await GET(new Request("http://localhost/api/backups/bk-test/preview"), makeParams("bk-test"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toContain("No JSON available");
    expect(body.extractable).toBe(true);
  });

  test("returns 500 when R2 body is null", async () => {
    const backup = makeBackup({ json_key: "backups/proj-test/bk-test.json" });
    mockGetBackup = async () => backup;
    mockDownloadFromR2 = async () => ({ body: null, contentType: "application/json", contentLength: 0 });

    const res = await GET(new Request("http://localhost/api/backups/bk-test/preview"), makeParams("bk-test"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Failed to download");
  });

  test("returns 413 when JSON exceeds 5MB", async () => {
    const backup = makeBackup({ json_key: "backups/proj-test/bk-test.json" });
    mockGetBackup = async () => backup;
    const largeContent = "x".repeat(5 * 1024 * 1024 + 1);
    mockDownloadFromR2 = async () => ({
      body: {
        transformToByteArray: async () => new TextEncoder().encode(largeContent),
      },
      contentType: "application/json",
      contentLength: largeContent.length,
    });

    const res = await GET(new Request("http://localhost/api/backups/bk-test/preview"), makeParams("bk-test"));
    expect(res.status).toBe(413);
  });

  test("returns 500 when stored JSON is invalid", async () => {
    const backup = makeBackup({ json_key: "backups/proj-test/bk-test.json" });
    mockGetBackup = async () => backup;
    mockDownloadFromR2 = async () => makeR2Body("not valid json {{{");

    const res = await GET(new Request("http://localhost/api/backups/bk-test/preview"), makeParams("bk-test"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("not valid JSON");
  });

  test("returns 500 on unexpected error", async () => {
    mockGetBackup = async () => {
      throw new Error("db crash");
    };

    const res = await GET(new Request("http://localhost/api/backups/bk-test/preview"), makeParams("bk-test"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to load preview");
  });
});
