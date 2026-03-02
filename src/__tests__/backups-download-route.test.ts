import { describe, expect, test, beforeEach, mock } from "bun:test";
import { BACKUP_STUBS, R2_STUBS, makeBackup } from "./helpers";

// --- Mutable mock state ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockGetBackup: (...args: any[]) => Promise<any> = async () => undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockCreatePresignedDownloadUrl: (...args: any[]) => Promise<string> = async () =>
  "https://mock.example.com/signed";

mock.module("@/lib/db/backups", () => ({
  ...BACKUP_STUBS,
  getBackup: (...args: unknown[]) => mockGetBackup(...args),
}));

mock.module("@/lib/r2/client", () => ({
  ...R2_STUBS,
  createPresignedDownloadUrl: (...args: unknown[]) => mockCreatePresignedDownloadUrl(...args),
}));

const { GET } = await import("@/app/api/backups/[id]/download/route");

// --- Helpers ---

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("/api/backups/[id]/download", () => {
  beforeEach(() => {
    mockGetBackup = async () => undefined;
    mockCreatePresignedDownloadUrl = async () => "https://mock.example.com/signed";
  });

  test("returns presigned download URL", async () => {
    const backup = makeBackup({ file_key: "backups/proj-test/bk-test.zip", file_size: 2048 });
    mockGetBackup = async () => backup;
    mockCreatePresignedDownloadUrl = async () => "https://r2.example.com/signed-url";

    const res = await GET(new Request("http://localhost/api/backups/bk-test/download"), makeParams("bk-test"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toBe("https://r2.example.com/signed-url");
    expect(body.file_key).toBe("backups/proj-test/bk-test.zip");
    expect(body.file_size).toBe(2048);
    expect(body.expires_in).toBe(900);
  });

  test("returns 404 when backup not found", async () => {
    const res = await GET(new Request("http://localhost/api/backups/missing/download"), makeParams("missing"));
    expect(res.status).toBe(404);
  });

  test("returns 500 on error", async () => {
    mockGetBackup = async () => {
      throw new Error("db error");
    };

    const res = await GET(new Request("http://localhost/api/backups/bk-test/download"), makeParams("bk-test"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to generate download URL");
  });

  test("returns 500 when presigned URL generation fails", async () => {
    const backup = makeBackup();
    mockGetBackup = async () => backup;
    mockCreatePresignedDownloadUrl = async () => {
      throw new Error("R2 error");
    };

    const res = await GET(new Request("http://localhost/api/backups/bk-test/download"), makeParams("bk-test"));
    expect(res.status).toBe(500);
  });
});
