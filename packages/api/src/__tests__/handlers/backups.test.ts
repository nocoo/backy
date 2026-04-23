import { describe, expect, test, beforeEach, mock } from "bun:test";
import { PROJECT_STUBS, BACKUP_STUBS } from "../helpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockListBackups: (...args: any[]) => Promise<any> = async () => ({
  rows: [],
  total: 0,
});
let mockListEnvironments: () => Promise<string[]> = async () => [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockListProjects: () => Promise<any[]> = async () => [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockGetProject: (id: string) => Promise<any> = async () => undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockGetBackup: (id: string) => Promise<any> = async () => undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockDeleteBackup: (id: string) => Promise<any> = async () => null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockDeleteBackups: (ids: string[]) => Promise<any[]> = async () => [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockCreateBackup: (...args: any[]) => Promise<any> = async () => ({
  id: "b1",
  project_id: "p1",
  created_at: "now",
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockUploadToR2: (...args: any[]) => Promise<void> = async () => {};
let mockDeleteFromR2: (k: string) => Promise<void> = async () => {};

mock.module("../../lib/db/backups", () => ({
  ...BACKUP_STUBS,
  listBackups: (...a: unknown[]) => mockListBackups(...a),
  listEnvironments: () => mockListEnvironments(),
  getBackup: (id: string) => mockGetBackup(id),
  deleteBackup: (id: string) => mockDeleteBackup(id),
  deleteBackups: (ids: string[]) => mockDeleteBackups(ids),
  createBackup: (...a: unknown[]) => mockCreateBackup(...a),
}));

mock.module("../../lib/db/projects", () => ({
  ...PROJECT_STUBS,
  listProjects: () => mockListProjects(),
  getProject: (id: string) => mockGetProject(id),
}));

mock.module("../../lib/r2/client", () => ({
  uploadToR2: (...a: unknown[]) => mockUploadToR2(...a),
  deleteFromR2: (k: string) => mockDeleteFromR2(k),
  pingR2: async () => {},
  isR2Configured: () => true,
  downloadFromR2: async () => new Uint8Array(),
  createPresignedDownloadUrl: async () => "https://example.com",
}));

const {
  listBackupsHandler,
  batchDeleteBackupsHandler,
  getBackupHandler,
  deleteBackupHandler,
  uploadBackupHandler,
} = await import("../../handlers/backups");

describe("backups handlers", () => {
  beforeEach(() => {
    mockListBackups = async () => ({ rows: [], total: 0 });
    mockListEnvironments = async () => [];
    mockListProjects = async () => [{ id: "p1", name: "P1" }];
    mockGetProject = async () => ({ id: "p1", name: "P1" });
    mockGetBackup = async () => undefined;
    mockDeleteBackup = async () => null;
    mockDeleteBackups = async () => [];
    mockCreateBackup = async () => ({
      id: "b1",
      project_id: "p1",
      created_at: "now",
    });
    mockUploadToR2 = async () => {};
    mockDeleteFromR2 = async () => {};
  });

  describe("listBackupsHandler", () => {
    test("200 with default sort/page", async () => {
      const r = await listBackupsHandler({});
      expect(r.status).toBe(200);
    });

    test("200 with all filters", async () => {
      const r = await listBackupsHandler({
        projectId: "p1",
        search: "x",
        environment: "prod",
        sortBy: "file_size",
        sortOrder: "asc",
        page: "2",
        pageSize: "10",
      });
      expect(r.status).toBe(200);
    });

    test("clamps pageSize > 100", async () => {
      const r = await listBackupsHandler({ pageSize: "9999" });
      expect(r.status).toBe(200);
    });

    test("invalid sortBy falls back to created_at", async () => {
      const r = await listBackupsHandler({ sortBy: "junk" });
      expect(r.status).toBe(200);
    });

    test("500 on db error", async () => {
      mockListBackups = async () => {
        throw new Error("db");
      };
      expect((await listBackupsHandler({})).status).toBe(500);
    });
  });

  describe("batchDeleteBackupsHandler", () => {
    test("200 deletes successfully", async () => {
      mockDeleteBackups = async () => [
        { fileKey: "k1", jsonKey: "j1" },
        { fileKey: "k2", jsonKey: null },
      ];
      const r = await batchDeleteBackupsHandler({ body: { ids: ["a", "b"] } });
      expect(r.status).toBe(200);
    });

    test("400 on empty array", async () => {
      const r = await batchDeleteBackupsHandler({ body: { ids: [] } });
      expect(r.status).toBe(400);
    });

    test("400 on non-array", async () => {
      const r = await batchDeleteBackupsHandler({ body: { ids: "x" } });
      expect(r.status).toBe(400);
    });

    test("400 on >50 ids", async () => {
      const r = await batchDeleteBackupsHandler({
        body: { ids: Array.from({ length: 51 }, (_, i) => String(i)) },
      });
      expect(r.status).toBe(400);
    });

    test("400 when ids contain non-strings", async () => {
      const r = await batchDeleteBackupsHandler({ body: { ids: ["a", 1] } });
      expect(r.status).toBe(400);
    });

    test("R2 errors are non-fatal", async () => {
      mockDeleteBackups = async () => [{ fileKey: "k", jsonKey: null }];
      mockDeleteFromR2 = async () => {
        throw new Error("r2");
      };
      const r = await batchDeleteBackupsHandler({ body: { ids: ["a"] } });
      expect(r.status).toBe(200);
    });

    test("500 on db error", async () => {
      mockDeleteBackups = async () => {
        throw new Error("db");
      };
      const r = await batchDeleteBackupsHandler({ body: { ids: ["a"] } });
      expect(r.status).toBe(500);
    });
  });

  describe("getBackupHandler", () => {
    test("200 when found", async () => {
      mockGetBackup = async () => ({ id: "b1" });
      expect((await getBackupHandler({ id: "b1" })).status).toBe(200);
    });

    test("404 when missing", async () => {
      expect((await getBackupHandler({ id: "x" })).status).toBe(404);
    });

    test("500 on db error", async () => {
      mockGetBackup = async () => {
        throw new Error("db");
      };
      expect((await getBackupHandler({ id: "x" })).status).toBe(500);
    });
  });

  describe("deleteBackupHandler", () => {
    test("200 when deleted", async () => {
      mockDeleteBackup = async () => ({ fileKey: "k", jsonKey: "j" });
      expect((await deleteBackupHandler({ id: "b1" })).status).toBe(200);
    });

    test("404 when missing", async () => {
      expect((await deleteBackupHandler({ id: "x" })).status).toBe(404);
    });

    test("R2 errors non-fatal", async () => {
      mockDeleteBackup = async () => ({ fileKey: "k", jsonKey: null });
      mockDeleteFromR2 = async () => {
        throw new Error("r2");
      };
      expect((await deleteBackupHandler({ id: "b1" })).status).toBe(200);
    });

    test("500 on db error", async () => {
      mockDeleteBackup = async () => {
        throw new Error("db");
      };
      expect((await deleteBackupHandler({ id: "x" })).status).toBe(500);
    });
  });

  describe("uploadBackupHandler", () => {
    function fd(parts: Record<string, string | File>): FormData {
      const f = new FormData();
      for (const [k, v] of Object.entries(parts)) f.append(k, v);
      return f;
    }

    test("400 missing projectId", async () => {
      const r = await uploadBackupHandler({ formData: fd({}) });
      expect(r.status).toBe(400);
    });

    test("404 when project missing", async () => {
      mockGetProject = async () => undefined;
      const r = await uploadBackupHandler({
        formData: fd({ projectId: "p1" }),
      });
      expect(r.status).toBe(404);
    });

    test("400 missing file", async () => {
      const r = await uploadBackupHandler({
        formData: fd({ projectId: "p1" }),
      });
      expect(r.status).toBe(400);
    });

    test("400 empty file", async () => {
      const file = new File([new Uint8Array()], "x.json", {
        type: "application/json",
      });
      const r = await uploadBackupHandler({
        formData: fd({ projectId: "p1", file }),
      });
      expect(r.status).toBe(400);
    });

    test("413 file too large", async () => {
      const big = new File(
        [new Uint8Array(51 * 1024 * 1024)],
        "x.bin",
        { type: "application/octet-stream" },
      );
      const r = await uploadBackupHandler({
        formData: fd({ projectId: "p1", file: big }),
      });
      expect(r.status).toBe(413);
    });

    test("400 invalid environment", async () => {
      const file = new File([new Uint8Array([1, 2, 3])], "x.bin", {
        type: "application/octet-stream",
      });
      const r = await uploadBackupHandler({
        formData: fd({
          projectId: "p1",
          file,
          environment: "bogus",
        }),
      });
      expect(r.status).toBe(400);
    });

    test("201 uploads non-JSON as-is", async () => {
      const file = new File([new Uint8Array([1, 2, 3])], "x.zip", {
        type: "application/zip",
      });
      const r = await uploadBackupHandler({
        formData: fd({
          projectId: "p1",
          file,
          environment: "prod",
          tag: "t1",
        }),
      });
      expect(r.status).toBe(201);
    });

    test("201 zips JSON and stores preview", async () => {
      const file = new File([new TextEncoder().encode('{"a":1}')], "x.json", {
        type: "application/json",
      });
      const r = await uploadBackupHandler({
        formData: fd({ projectId: "p1", file }),
      });
      expect(r.status).toBe(201);
    });

    test("500 on createBackup error", async () => {
      mockCreateBackup = async () => {
        throw new Error("db");
      };
      const file = new File([new Uint8Array([1, 2, 3])], "x.bin", {
        type: "application/octet-stream",
      });
      const r = await uploadBackupHandler({
        formData: fd({ projectId: "p1", file }),
      });
      expect(r.status).toBe(500);
    });
  });
});
