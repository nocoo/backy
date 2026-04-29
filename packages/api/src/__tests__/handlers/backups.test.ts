import { describe, expect, test, beforeEach, vi } from "vitest";
import {
  PROJECT_STUBS,
  BACKUP_STUBS,
  makeMockCtx,
  makeMockR2,
} from "../helpers";

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockDownloadFromR2: (k: string) => Promise<any> = async () => ({
  body: null,
  bytes: async () => new Uint8Array(),
  contentType: undefined,
  contentLength: undefined,
});
let mockCreatePresignedDownloadUrl: (k: string, ttl: number) => Promise<string> = async () =>
  "https://example.com/presigned";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockUpdateBackup: (...args: any[]) => Promise<any> = async () => ({});

function skipDb<T extends unknown[], R>(fn: (...args: T) => R) {
  return (...args: [unknown, ...T]) => fn(...(args.slice(1) as T));
}

vi.doMock("../../lib/db/backups", () => ({
  ...BACKUP_STUBS,
  listBackups: skipDb((...a: unknown[]) => mockListBackups(...a)),
  listEnvironments: skipDb(() => mockListEnvironments()),
  getBackup: skipDb((id: string) => mockGetBackup(id)),
  deleteBackup: skipDb((id: string) => mockDeleteBackup(id)),
  deleteBackups: skipDb((ids: string[]) => mockDeleteBackups(ids)),
  createBackup: skipDb((...a: unknown[]) => mockCreateBackup(...a)),
  updateBackup: skipDb((...a: unknown[]) => mockUpdateBackup(...a)),
}));

vi.doMock("../../lib/db/projects", () => ({
  ...PROJECT_STUBS,
  listProjects: skipDb(() => mockListProjects()),
  getProject: skipDb((id: string) => mockGetProject(id)),
}));

const backupsHandlers = await import("../../handlers/backups");
const ctx = makeMockCtx({
  r2: makeMockR2({
    put: async (key, body, opts) =>
      mockUploadToR2(key, body, opts?.contentType),
    delete: async (key) => mockDeleteFromR2(key),
    get: async (key) => mockDownloadFromR2(key),
    presignDownload: async (key, ttl) => mockCreatePresignedDownloadUrl(key, ttl),
  }),
});
const listBackupsHandler = (input: Parameters<typeof backupsHandlers.listBackupsHandler>[0]) =>
  backupsHandlers.listBackupsHandler(input, ctx);
const batchDeleteBackupsHandler = (
  input: Parameters<typeof backupsHandlers.batchDeleteBackupsHandler>[0],
) => backupsHandlers.batchDeleteBackupsHandler(input, ctx);
const getBackupHandler = (input: Parameters<typeof backupsHandlers.getBackupHandler>[0]) =>
  backupsHandlers.getBackupHandler(input, ctx);
const deleteBackupHandler = (
  input: Parameters<typeof backupsHandlers.deleteBackupHandler>[0],
) => backupsHandlers.deleteBackupHandler(input, ctx);
const uploadBackupHandler = (
  input: Parameters<typeof backupsHandlers.uploadBackupHandler>[0],
) => backupsHandlers.uploadBackupHandler(input, ctx);
const downloadBackupHandler = (
  input: Parameters<typeof backupsHandlers.downloadBackupHandler>[0],
) => backupsHandlers.downloadBackupHandler(input, ctx);
const previewBackupHandler = (
  input: Parameters<typeof backupsHandlers.previewBackupHandler>[0],
) => backupsHandlers.previewBackupHandler(input, ctx);
const extractBackupHandler = (
  input: Parameters<typeof backupsHandlers.extractBackupHandler>[0],
) => backupsHandlers.extractBackupHandler(input, ctx);
const restoreCommandHandler = (
  input: Parameters<typeof backupsHandlers.restoreCommandHandler>[0],
) => backupsHandlers.restoreCommandHandler(input, ctx);

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
    mockDownloadFromR2 = async () => ({
      body: null,
      bytes: async () => new Uint8Array(),
      contentType: undefined,
      contentLength: undefined,
    });
    mockCreatePresignedDownloadUrl = async () =>
      "https://example.com/presigned";
    mockUpdateBackup = async () => ({});
  });

  describe("listBackupsHandler", () => {
    test("200 with default sort/page", async () => {
      const r = await listBackupsHandler({});
      expect(r.status).toBe(200);
    });

    test("200 with all filters", async () => {
      let captured: unknown;
      mockListBackups = async (...args: unknown[]) => {
        captured = args[0];
        return { rows: [], total: 0 };
      };
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
      // Tightened: pin the entire filter object the handler forwards to
      // listBackups(). 200-only would mask any drift in projectId /
      // search / environment / sortOrder / pagination math.
      expect(captured).toEqual({
        projectId: "p1",
        search: "x",
        environment: "prod",
        sortBy: "file_size",
        sortOrder: "asc",
        page: 2,
        pageSize: 10,
      });
    });

    test("clamps pageSize > 100", async () => {
      let captured: { pageSize?: number } = {};
      mockListBackups = async (input: { pageSize?: number }) => {
        captured = input;
        return { rows: [], total: 0 };
      };
      const r = await listBackupsHandler({ pageSize: "9999" });
      expect(r.status).toBe(200);
      // Tightened: positively assert the clamp produced 100, not just
      // that the call succeeded with garbage input.
      expect(captured.pageSize).toBe(100);
    });

    test("invalid sortBy falls back to created_at", async () => {
      let captured: { sortBy?: string } = {};
      mockListBackups = async (input: { sortBy?: string }) => {
        captured = input;
        return { rows: [], total: 0 };
      };
      const r = await listBackupsHandler({ sortBy: "junk" });
      expect(r.status).toBe(200);
      // Tightened: positively assert the fallback value, not just 200.
      expect(captured.sortBy).toBe("created_at");
    });

    test("500 on db error", async () => {
      mockListBackups = async () => {
        throw new Error("db");
      };
      const r = await listBackupsHandler({});
      expect(r.status).toBe(500);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        expect(r.body).toEqual({ error: "Failed to list backups" });
    });
  });

  describe("batchDeleteBackupsHandler", () => {
    test("200 deletes successfully", async () => {
      const deletes: string[] = [];
      mockDeleteFromR2 = async (key: string) => {
        deletes.push(key);
      };
      mockDeleteBackups = async () => [
        { fileKey: "k1", jsonKey: "j1" },
        { fileKey: "k2", jsonKey: null },
      ];
      const r = await batchDeleteBackupsHandler({ body: { ids: ["a", "b"] } });
      expect(r.status).toBe(200);
      // Tightened: positively verify R2 cleanup deleted both backup
      // file_keys + only the present json_keys (jsonKey:null must NOT
      // produce a stray r2.delete(null) call). Also pin the response
      // body's `deleted` count.
      expect(deletes).toEqual(["k1", "j1", "k2"]);
      expect(r.kind).toBe("json");
      const body = (r as { body: Record<string, unknown> }).body;
      expect(body).toEqual({ success: true, deleted: 2 });
    });

    test("400 on empty array", async () => {
      const r = await batchDeleteBackupsHandler({ body: { ids: [] } });
      expect(r.status).toBe(400);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        // Empty array hits the same 'non-empty array of strings' branch
        // as the non-array / non-string-element cases.
        expect(r.body).toEqual({
          error: "ids must be a non-empty array of strings",
        });
    });

    test("400 on non-array", async () => {
      const r = await batchDeleteBackupsHandler({ body: { ids: "x" } });
      expect(r.status).toBe(400);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        expect(r.body).toEqual({
          error: "ids must be a non-empty array of strings",
        });
    });

    test("400 on >50 ids", async () => {
      const r = await batchDeleteBackupsHandler({
        body: { ids: Array.from({ length: 51 }, (_, i) => String(i)) },
      });
      expect(r.status).toBe(400);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        // Distinct error message from the empty/non-array branch —
        // pinning prevents a refactor from collapsing them.
        expect(r.body).toEqual({
          error: "Maximum 50 backups can be deleted at once",
        });
    });

    test("400 when ids contain non-strings", async () => {
      const r = await batchDeleteBackupsHandler({ body: { ids: ["a", 1] } });
      expect(r.status).toBe(400);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        // 'ids contains non-string' hits the same generic branch as the
        // empty/non-array cases (the check is conjunctive).
        expect(r.body).toEqual({
          error: "ids must be a non-empty array of strings",
        });
    });

    test("R2 errors are non-fatal", async () => {
      mockDeleteBackups = async () => [{ fileKey: "k", jsonKey: null }];
      mockDeleteFromR2 = async () => {
        throw new Error("r2");
      };
      const r = await batchDeleteBackupsHandler({ body: { ids: ["a"] } });
      expect(r.status).toBe(200);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        // R2 delete throws but the handler still returns success:true
        // with the deleted-row count from D1 (R2 cleanup is non-fatal).
        expect(r.body).toEqual({ success: true, deleted: 1 });
    });

    test("500 on db error", async () => {
      mockDeleteBackups = async () => {
        throw new Error("db");
      };
      const r = await batchDeleteBackupsHandler({ body: { ids: ["a"] } });
      expect(r.status).toBe(500);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        expect(r.body).toEqual({ error: "Failed to batch delete backups" });
    });
  });

  describe("getBackupHandler", () => {
    test("200 when found", async () => {
      mockGetBackup = async () => ({ id: "b1", project_id: "p1" });
      const r = await getBackupHandler({ id: "b1" });
      expect(r.status).toBe(200);
      // Tightened: handler must pass the full backup row through verbatim.
      expect(r.kind).toBe("json");
      expect((r as { body: unknown }).body).toEqual({
        id: "b1",
        project_id: "p1",
      });
    });

    test("404 when missing", async () => {
      const r = await getBackupHandler({ id: "x" });
      expect(r.status).toBe(404);
      expect(r.kind).toBe("json");
      expect((r as { body: unknown }).body).toEqual({ error: "Backup not found" });
    });

    test("500 on db error", async () => {
      mockGetBackup = async () => {
        throw new Error("db");
      };
      const r = await getBackupHandler({ id: "x" });
      expect(r.status).toBe(500);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        expect(r.body).toEqual({ error: "Failed to get backup" });
    });
  });

  describe("deleteBackupHandler", () => {
    test("200 when deleted", async () => {
      const deletes: string[] = [];
      mockDeleteFromR2 = async (key: string) => {
        deletes.push(key);
      };
      mockDeleteBackup = async () => ({ fileKey: "k", jsonKey: "j" });
      const r = await deleteBackupHandler({ id: "b1" });
      expect(r.status).toBe(200);
      // Tightened: positively verify R2 cleanup ordering (fileKey first,
      // jsonKey second) AND the response body. Status-only would mask a
      // regression that returns 200 without actually calling r2.delete.
      expect(deletes).toEqual(["k", "j"]);
      expect(r.kind).toBe("json");
      expect((r as { body: unknown }).body).toEqual({ success: true });
    });

    test("404 when missing", async () => {
      const r = await deleteBackupHandler({ id: "x" });
      expect(r.status).toBe(404);
      expect(r.kind).toBe("json");
      expect((r as { body: unknown }).body).toEqual({ error: "Backup not found" });
    });

    test("R2 errors non-fatal", async () => {
      mockDeleteBackup = async () => ({ fileKey: "k", jsonKey: null });
      mockDeleteFromR2 = async () => {
        throw new Error("r2");
      };
      const r = await deleteBackupHandler({ id: "b1" });
      expect(r.status).toBe(200);
      // Tightened: even when R2 throws, the handler should still report
      // success:true to the client (the cleanup is non-fatal by design).
      expect(r.kind).toBe("json");
      expect((r as { body: unknown }).body).toEqual({ success: true });
    });

    test("500 on db error", async () => {
      mockDeleteBackup = async () => {
        throw new Error("db");
      };
      const r = await deleteBackupHandler({ id: "x" });
      expect(r.status).toBe(500);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        expect(r.body).toEqual({ error: "Failed to delete backup" });
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
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        expect(r.body).toEqual({ error: "projectId is required" });
    });

    test("404 when project missing", async () => {
      mockGetProject = async () => undefined;
      const r = await uploadBackupHandler({
        formData: fd({ projectId: "p1" }),
      });
      expect(r.status).toBe(404);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        // Distinct 'Project not found' (vs 'Backup not found' on the
        // get/delete handlers).
        expect(r.body).toEqual({ error: "Project not found" });
    });

    test("400 missing file", async () => {
      const r = await uploadBackupHandler({
        formData: fd({ projectId: "p1" }),
      });
      expect(r.status).toBe(400);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        expect(r.body).toEqual({ error: "Missing 'file' field in form data" });
    });

    test("400 empty file", async () => {
      const file = new File([new Uint8Array()], "x.json", {
        type: "application/json",
      });
      const r = await uploadBackupHandler({
        formData: fd({ projectId: "p1", file }),
      });
      expect(r.status).toBe(400);
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        expect(r.body).toEqual({ error: "File is empty" });
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
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        // 413 = MAX_FILE_SIZE (50MB) limit. Pin the user-facing string
        // so a regression that bumps the limit silently surfaces.
        expect(r.body).toEqual({ error: "File too large. Maximum: 50MB" });
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
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        expect(r.body).toEqual({
          error: "Invalid environment. Allowed: dev, prod, staging, test",
        });
    });

    test("201 uploads non-JSON as-is", async () => {
      const uploads: Array<{ key: string; size: number; type: string | undefined }> = [];
      mockUploadToR2 = async (key: string, body: ArrayBuffer | Uint8Array, type?: string) => {
        const u8 = body instanceof Uint8Array ? body : new Uint8Array(body);
        uploads.push({ key, size: u8.byteLength, type });
      };
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
      // Tightened: verify the non-JSON path uploads the bytes verbatim
      // (3 bytes, content-type preserved) and does NOT create a preview.
      // 201-only would mask a regression that re-encoded the body or
      // accidentally generated a preview for binaries.
      expect(uploads).toHaveLength(1);
      expect(uploads[0]).toMatchObject({
        size: 3,
        type: "application/zip",
      });
      expect(uploads[0]!.key).toMatch(/^backups\/p1\//);
    });

    test("201 zips JSON and stores preview", async () => {
      const uploads: Array<{ key: string; size: number; type: string | undefined }> = [];
      mockUploadToR2 = async (key: string, body: ArrayBuffer | Uint8Array, type?: string) => {
        const u8 = body instanceof Uint8Array ? body : new Uint8Array(body);
        uploads.push({ key, size: u8.byteLength, type });
      };
      const file = new File([new TextEncoder().encode('{"a":1}')], "x.json", {
        type: "application/json",
      });
      const r = await uploadBackupHandler({
        formData: fd({ projectId: "p1", file }),
      });
      expect(r.status).toBe(201);
      // Tightened: verify the JSON path uploads BOTH a gzipped backup
      // and a JSON preview (two distinct R2 keys). 201-only would mask
      // a regression that skipped preview generation or stored the raw
      // JSON instead of compressing.
      expect(uploads).toHaveLength(2);
      const backup = uploads.find((u) => u.key.startsWith("backups/"));
      const preview = uploads.find((u) => u.key.startsWith("previews/"));
      expect(backup).toBeDefined();
      expect(preview).toBeDefined();
      expect(preview!.type).toBe("application/json");
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
      expect(r.kind).toBe("json");
      if (r.kind === "json")
        // Discovery: createBackup throws are caught by the OUTER
        // try/catch which surfaces the generic 'Internal server error'
        // (the inner db-error catch returns a more specific message via
        // fireLog and a 200 stub response, but does NOT re-throw — see
        // backups.ts uploadBackupHandler).
        expect(r.body).toEqual({ error: "Internal server error" });
    });
  });

  describe("downloadBackupHandler", () => {
    test("200 with presigned url", async () => {
      mockGetBackup = async () => ({
        id: "b1",
        file_key: "k",
        file_size: 100,
      });
      let presignArgs: [string, number] | undefined;
      mockCreatePresignedDownloadUrl = async (key: string, ttl: number) => {
        presignArgs = [key, ttl];
        return "https://signed.example/x";
      };
      const r = await downloadBackupHandler({ id: "b1" });
      expect(r.status).toBe(200);
      // Tightened: status-only would mask url/file_key/file_size/
      // expires_in drift in the response body, AND would let a regression
      // pass that hard-coded the wrong key or TTL into the presigner call.
      expect(presignArgs).toEqual(["k", 900]);
      expect(r.kind).toBe("json");
      expect((r as { body: unknown }).body).toEqual({
        url: "https://signed.example/x",
        file_key: "k",
        file_size: 100,
        expires_in: 900,
      });
    });

    test("404 when missing", async () => {
      const r = await downloadBackupHandler({ id: "x" });
      expect(r.status).toBe(404);
    });

    test("500 on db error", async () => {
      mockGetBackup = async () => {
        throw new Error("db");
      };
      const r = await downloadBackupHandler({ id: "x" });
      expect(r.status).toBe(500);
    });

    test("500 on presign error", async () => {
      mockGetBackup = async () => ({
        id: "b1",
        file_key: "k",
        file_size: 1,
      });
      mockCreatePresignedDownloadUrl = async () => {
        throw new Error("r2");
      };
      const r = await downloadBackupHandler({ id: "b1" });
      expect(r.status).toBe(500);
    });
  });

  describe("previewBackupHandler", () => {
    function bodyOf(bytes: Uint8Array) {
      return { transformToByteArray: async () => bytes };
    }

    test("404 when missing", async () => {
      const r = await previewBackupHandler({ id: "x" });
      expect(r.status).toBe(404);
    });

    test("404 when no json_key", async () => {
      mockGetBackup = async () => ({
        id: "b1",
        json_key: null,
        is_single_json: 0,
      });
      const r = await previewBackupHandler({ id: "b1" });
      expect(r.status).toBe(404);
    });

    test("500 when r2 body missing", async () => {
      mockGetBackup = async () => ({ id: "b1", json_key: "j" });
      mockDownloadFromR2 = async () => ({ body: null });
      const r = await previewBackupHandler({ id: "b1" });
      expect(r.status).toBe(500);
    });

    test("413 when too large", async () => {
      mockGetBackup = async () => ({ id: "b1", json_key: "j" });
      mockDownloadFromR2 = async () => ({
        body: bodyOf(new Uint8Array(6 * 1024 * 1024)),
      });
      const r = await previewBackupHandler({ id: "b1" });
      expect(r.status).toBe(413);
    });

    test("500 when stored content not valid JSON", async () => {
      mockGetBackup = async () => ({ id: "b1", json_key: "j" });
      mockDownloadFromR2 = async () => ({
        body: bodyOf(new TextEncoder().encode("not-json")),
      });
      const r = await previewBackupHandler({ id: "b1" });
      expect(r.status).toBe(500);
    });

    test("200 returns parsed content", async () => {
      mockGetBackup = async () => ({
        id: "b1",
        project_id: "p1",
        project_name: "P1",
        json_key: "j",
      });
      mockDownloadFromR2 = async () => ({
        body: bodyOf(new TextEncoder().encode('{"a":1}')),
      });
      const r = await previewBackupHandler({ id: "b1" });
      expect(r.status).toBe(200);
      // Tightened: pin the full preview body shape. 200-only would mask
      // a regression that returned the raw text instead of parsed JSON,
      // dropped any of the metadata fields, or surfaced extra fields.
      expect(r.kind).toBe("json");
      expect((r as { body: unknown }).body).toEqual({
        backup_id: "b1",
        project_id: "p1",
        project_name: "P1",
        json_key: "j",
        content: { a: 1 },
      });
    });

    test("500 on download error", async () => {
      mockGetBackup = async () => ({ id: "b1", json_key: "j" });
      mockDownloadFromR2 = async () => {
        throw new Error("r2");
      };
      const r = await previewBackupHandler({ id: "b1" });
      expect(r.status).toBe(500);
    });
  });

  describe("extractBackupHandler", () => {
    function bodyOf(bytes: Uint8Array) {
      return { transformToByteArray: async () => bytes };
    }

    test("404 when missing", async () => {
      const r = await extractBackupHandler({ id: "x" });
      expect(r.status).toBe(404);
    });

    test("200 when json_key already set", async () => {
      mockGetBackup = async () => ({ id: "b1", json_key: "existing" });
      const r = await extractBackupHandler({ id: "b1" });
      expect(r.status).toBe(200);
      // Tightened: pin the no-op response shape (handler short-circuits
      // when json_key already set; must NOT touch R2 or call updateBackup).
      expect(r.kind).toBe("json");
      expect((r as { body: unknown }).body).toEqual({
        message: "JSON already available",
        json_key: "existing",
      });
    });

    test("400 when already single JSON", async () => {
      mockGetBackup = async () => ({
        id: "b1",
        json_key: null,
        is_single_json: 1,
      });
      const r = await extractBackupHandler({ id: "b1" });
      expect(r.status).toBe(400);
    });

    test("400 when file_type not extractable", async () => {
      mockGetBackup = async () => ({
        id: "b1",
        json_key: null,
        is_single_json: 0,
        file_type: "unknown",
      });
      const r = await extractBackupHandler({ id: "b1" });
      expect(r.status).toBe(400);
    });

    test("500 when r2 body missing", async () => {
      mockGetBackup = async () => ({
        id: "b1",
        json_key: null,
        is_single_json: 0,
        file_type: "zip",
        file_key: "k",
        project_id: "p1",
      });
      mockDownloadFromR2 = async () => ({ body: null });
      const r = await extractBackupHandler({ id: "b1" });
      expect(r.status).toBe(500);
    });

    test("400 when contentLength exceeds limit", async () => {
      mockGetBackup = async () => ({
        id: "b1",
        json_key: null,
        is_single_json: 0,
        file_type: "zip",
        file_key: "k",
        project_id: "p1",
      });
      mockDownloadFromR2 = async () => ({
        body: bodyOf(new Uint8Array()),
        contentLength: 60 * 1024 * 1024,
      });
      const r = await extractBackupHandler({ id: "b1" });
      expect(r.status).toBe(400);
    });

    test("400 when extraction fails", async () => {
      mockGetBackup = async () => ({
        id: "b1",
        json_key: null,
        is_single_json: 0,
        file_type: "zip",
        file_key: "k",
        project_id: "p1",
      });
      // empty zip body — extractor will report no JSON found
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      zip.file("readme.txt", "hi");
      const buf = await zip.generateAsync({ type: "uint8array" });
      mockDownloadFromR2 = async () => ({
        body: bodyOf(buf),
      });
      const r = await extractBackupHandler({ id: "b1" });
      expect(r.status).toBe(400);
    });

    test("200 on successful extraction", async () => {
      mockGetBackup = async () => ({
        id: "b1",
        json_key: null,
        is_single_json: 0,
        file_type: "zip",
        file_key: "k",
        project_id: "p1",
      });
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      zip.file("data.json", '{"a":1}');
      const buf = await zip.generateAsync({ type: "uint8array" });
      mockDownloadFromR2 = async () => ({ body: bodyOf(buf) });
      const uploaded: string[] = [];
      mockUploadToR2 = async (key: string) => {
        uploaded.push(key);
      };
      let updateArg: unknown;
      mockUpdateBackup = async (_id: string, patch: unknown) => {
        updateArg = patch;
        return {};
      };
      const r = await extractBackupHandler({ id: "b1" });
      expect(r.status).toBe(200);
      // Tightened: positively verify the side effects: (1) the
      // extracted JSON is uploaded to R2 once, (2) the DB is updated
      // with the new jsonKey + jsonExtracted:true, (3) the response
      // body announces the source file and json count from the extractor.
      expect(uploaded).toHaveLength(1);
      expect(uploaded[0]).toMatch(/^previews\/p1\//);
      expect(updateArg).toEqual({
        jsonKey: uploaded[0],
        jsonExtracted: true,
      });
      expect(r.kind).toBe("json");
      expect((r as { body: unknown }).body).toEqual({
        message: "JSON extracted successfully",
        json_key: uploaded[0],
        source_file: "data.json",
        json_files_found: 1,
      });
    });

    test("500 on db error", async () => {
      mockGetBackup = async () => {
        throw new Error("db");
      };
      const r = await extractBackupHandler({ id: "x" });
      expect(r.status).toBe(500);
    });
  });

  describe("restoreCommandHandler", () => {
    const baseUrl = "https://example.com";

    test("404 when backup missing", async () => {
      const r = await restoreCommandHandler({ id: "x", baseUrl });
      expect(r.status).toBe(404);
    });

    test("404 when project missing", async () => {
      mockGetBackup = async () => ({ id: "b1", project_id: "p1" });
      mockGetProject = async () => undefined;
      const r = await restoreCommandHandler({ id: "b1", baseUrl });
      expect(r.status).toBe(404);
    });

    test("200 returns curl command", async () => {
      mockGetBackup = async () => ({ id: "b1", project_id: "p1" });
      mockGetProject = async () => ({
        id: "p1",
        name: "P1",
        webhook_token: "tok",
      });
      const r = await restoreCommandHandler({ id: "b1", baseUrl });
      expect(r.status).toBe(200);
      expect(r.kind).toBe("json");
      if (r.kind === "json") {
        const body = r.body as { command: string };
        // Tightened: pin the exact string. Three toContain checks miss
        // ordering / escape / extra-arg regressions; a full equality
        // check catches all of them.
        expect(body.command).toBe(
          `curl https://example.com/api/restore/b1 \\\n  -H "Authorization: Bearer tok"`,
        );
      }
    });

    test("500 on db error", async () => {
      mockGetBackup = async () => {
        throw new Error("db");
      };
      const r = await restoreCommandHandler({ id: "x", baseUrl });
      expect(r.status).toBe(500);
    });
  });
});
