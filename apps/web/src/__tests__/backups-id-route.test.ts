import { describe, expect, test, beforeEach, mock } from "bun:test";
import { BACKUP_STUBS, R2_STUBS, makeBackup } from "./helpers";

// --- Mutable mock state ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockGetBackup: (...args: any[]) => Promise<any> = async () => undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockDeleteBackup: (...args: any[]) => Promise<any> = async () => undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockDeleteFromR2: (...args: any[]) => Promise<void> = async () => {};

mock.module("@/lib/db/backups", () => ({
  ...BACKUP_STUBS,
  getBackup: (...args: unknown[]) => mockGetBackup(...args),
  deleteBackup: (...args: unknown[]) => mockDeleteBackup(...args),
}));

mock.module("@/lib/r2/client", () => ({
  ...R2_STUBS,
  deleteFromR2: (...args: unknown[]) => mockDeleteFromR2(...args),
}));

const { GET, DELETE } = await import("@/app/api/backups/[id]/route");

// --- Helpers ---

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("/api/backups/[id]", () => {
  beforeEach(() => {
    mockGetBackup = async () => undefined;
    mockDeleteBackup = async () => undefined;
    mockDeleteFromR2 = async () => {};
  });

  // -----------------------------------------------------------------------
  // GET
  // -----------------------------------------------------------------------

  describe("GET", () => {
    test("returns backup when found", async () => {
      const backup = makeBackup();
      mockGetBackup = async () => backup;

      const res = await GET(new Request("http://localhost/api/backups/bk-test"), makeParams("bk-test"));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.id).toBe("bk-test");
      expect(body.project_id).toBe("proj-test");
    });

    test("returns 404 when not found", async () => {
      mockGetBackup = async () => undefined;

      const res = await GET(new Request("http://localhost/api/backups/missing"), makeParams("missing"));
      expect(res.status).toBe(404);
    });

    test("returns 500 on error", async () => {
      mockGetBackup = async () => {
        throw new Error("db error");
      };

      const res = await GET(new Request("http://localhost/api/backups/bk-test"), makeParams("bk-test"));
      expect(res.status).toBe(500);
    });
  });

  // -----------------------------------------------------------------------
  // DELETE
  // -----------------------------------------------------------------------

  describe("DELETE", () => {
    test("deletes backup and cleans up R2 files", async () => {
      mockDeleteBackup = async () => ({ fileKey: "a.zip", jsonKey: "a.json" });
      const r2Deleted: string[] = [];
      mockDeleteFromR2 = async (key: string) => {
        r2Deleted.push(key);
      };

      const res = await DELETE(new Request("http://localhost/api/backups/bk-1"), makeParams("bk-1"));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(r2Deleted).toEqual(["a.zip", "a.json"]);
    });

    test("does not call deleteFromR2 for null jsonKey", async () => {
      mockDeleteBackup = async () => ({ fileKey: "a.zip", jsonKey: null });
      const r2Deleted: string[] = [];
      mockDeleteFromR2 = async (key: string) => {
        r2Deleted.push(key);
      };

      await DELETE(new Request("http://localhost/api/backups/bk-1"), makeParams("bk-1"));
      expect(r2Deleted).toEqual(["a.zip"]);
    });

    test("returns 404 when backup not found", async () => {
      mockDeleteBackup = async () => undefined;

      const res = await DELETE(new Request("http://localhost/api/backups/missing"), makeParams("missing"));
      expect(res.status).toBe(404);
    });

    test("returns 200 even when R2 cleanup fails", async () => {
      mockDeleteBackup = async () => ({ fileKey: "a.zip", jsonKey: null });
      mockDeleteFromR2 = async () => {
        throw new Error("R2 failure");
      };

      const res = await DELETE(new Request("http://localhost/api/backups/bk-1"), makeParams("bk-1"));
      expect(res.status).toBe(200);
    });

    test("returns 500 on unexpected error", async () => {
      mockDeleteBackup = async () => {
        throw new Error("db exploded");
      };

      const res = await DELETE(new Request("http://localhost/api/backups/bk-1"), makeParams("bk-1"));
      expect(res.status).toBe(500);
    });
  });
});
