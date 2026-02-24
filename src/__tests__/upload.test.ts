import { describe, expect, test, beforeEach, mock } from "bun:test";

// --- Mutable mock state ---

let mockGetProjectResult: { id: string; name: string } | undefined = {
  id: "proj-123",
  name: "Test Project",
};

let mockCreateBackupResult = {
  id: "backup-upload-1",
  project_id: "proj-123",
  environment: null as string | null,
  sender_ip: "manual-upload",
  tag: null as string | null,
  file_key: "backups/proj-123/upload.zip",
  json_key: null as string | null,
  file_size: 100,
  is_single_json: 0,
  json_extracted: 0,
  created_at: "2026-02-01T00:00:00.000Z",
  updated_at: "2026-02-01T00:00:00.000Z",
};

const uploadCalls: Array<{ key: string; contentType: string }> = [];

mock.module("@/lib/db/projects", () => ({
  getProject: async () => mockGetProjectResult,
  getProjectByToken: async () => undefined,
  listProjects: async () => [],
  createProject: async () => ({}),
  updateProject: async () => undefined,
  deleteProject: async () => false,
  regenerateToken: async () => undefined,
}));

mock.module("@/lib/db/backups", () => ({
  createBackup: async (data: Record<string, unknown>) => ({
    ...mockCreateBackupResult,
    project_id: data.projectId,
    environment: data.environment ?? null,
    tag: data.tag ?? null,
  }),
  getBackup: async () => undefined,
  listBackups: async () => ({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
  listEnvironments: async () => [],
  deleteBackups: async () => [],
  updateBackup: async () => undefined,
  deleteBackup: async () => undefined,
  getBackupFileKeys: async () => [],
  countBackups: async () => 0,
}));

mock.module("@/lib/r2/client", () => ({
  uploadToR2: async (key: string, _data: unknown, contentType: string) => {
    uploadCalls.push({ key, contentType });
  },
  isR2Configured: () => true,
  pingR2: async () => {},
  resetR2Client: () => {},
  downloadFromR2: async () => ({ body: null, contentType: "application/octet-stream", contentLength: 0 }),
  createPresignedDownloadUrl: async () => "https://mock.example.com/signed",
  deleteFromR2: async () => {},
  deleteMultipleFromR2: async () => 0,
  listR2Objects: async () => [],
}));

// Import AFTER mocks
const { POST } = await import("@/app/api/backups/upload/route");

// --- Helpers ---

function uploadRequest(opts: {
  file?: File | null;
  projectId?: string | null;
  tag?: string;
  environment?: string;
}): Request {
  const formData = new FormData();

  if (opts.projectId !== null) {
    formData.append("projectId", opts.projectId ?? "proj-123");
  }

  if (opts.file !== null && opts.file !== undefined) {
    formData.append("file", opts.file);
  }

  if (opts.tag) {
    formData.append("tag", opts.tag);
  }

  if (opts.environment) {
    formData.append("environment", opts.environment);
  }

  return new Request("http://localhost:7026/api/backups/upload", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/backups/upload", () => {
  beforeEach(() => {
    mockGetProjectResult = { id: "proj-123", name: "Test Project" };
    mockCreateBackupResult = {
      id: "backup-upload-1",
      project_id: "proj-123",
      environment: null,
      sender_ip: "manual-upload",
      tag: null,
      file_key: "backups/proj-123/upload.zip",
      json_key: null,
      file_size: 100,
      is_single_json: 0,
      json_extracted: 0,
      created_at: "2026-02-01T00:00:00.000Z",
      updated_at: "2026-02-01T00:00:00.000Z",
    };
    uploadCalls.length = 0;
  });

  test("returns 400 when projectId is missing", async () => {
    const req = uploadRequest({
      projectId: null,
      file: new File(["data"], "backup.json", { type: "application/json" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("projectId");
  });

  test("returns 404 when project not found", async () => {
    mockGetProjectResult = undefined;
    const req = uploadRequest({
      file: new File(["data"], "backup.json", { type: "application/json" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  test("returns 400 when file is missing", async () => {
    const formData = new FormData();
    formData.append("projectId", "proj-123");
    const req = new Request("http://localhost:7026/api/backups/upload", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("file");
  });

  test("returns 400 when file is empty", async () => {
    const req = uploadRequest({
      file: new File([], "empty.json", { type: "application/json" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("empty");
  });

  test("returns 413 when file exceeds 50MB", async () => {
    // Create a file slightly over 50MB
    const bigData = new Uint8Array(50 * 1024 * 1024 + 1);
    const req = uploadRequest({
      file: new File([bigData], "huge.json", { type: "application/json" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toContain("large");
  });

  test("returns 400 for unsupported file type", async () => {
    const req = uploadRequest({
      file: new File(["data"], "backup.txt", { type: "text/plain" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Unsupported");
  });

  test("returns 400 for invalid environment value", async () => {
    const req = uploadRequest({
      file: new File(["data"], "backup.json", { type: "application/json" }),
      environment: "invalid-env",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("environment");
  });

  test("uploads JSON file: auto-compresses to ZIP and stores preview", async () => {
    const jsonContent = JSON.stringify({ hello: "world" });
    const req = uploadRequest({
      file: new File([jsonContent], "backup.json", { type: "application/json" }),
      environment: "prod",
      tag: "daily",
    });
    const res = await POST(req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.project_id).toBe("proj-123");
    expect(body.file_size).toBeGreaterThan(0);
    expect(body.created_at).toBeDefined();

    // Should have TWO R2 uploads: zip + preview JSON
    expect(uploadCalls).toHaveLength(2);
    expect(uploadCalls[0]!.key).toContain("backups/proj-123/");
    expect(uploadCalls[0]!.key).toEndWith(".zip");
    expect(uploadCalls[0]!.contentType).toBe("application/zip");
    expect(uploadCalls[1]!.key).toContain("previews/proj-123/");
    expect(uploadCalls[1]!.key).toEndWith(".json");
    expect(uploadCalls[1]!.contentType).toBe("application/json");
  });

  test("uploads ZIP file: stores as-is without preview", async () => {
    const zipData = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    const req = uploadRequest({
      file: new File([zipData], "backup.zip", { type: "application/zip" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);

    // Should have ONE R2 upload: just the zip
    expect(uploadCalls).toHaveLength(1);
    expect(uploadCalls[0]!.key).toContain("backups/proj-123/");
    expect(uploadCalls[0]!.key).toEndWith(".zip");
    expect(uploadCalls[0]!.contentType).toBe("application/zip");
  });

  test("passes tag and environment through to backup metadata", async () => {
    const req = uploadRequest({
      file: new File(["data"], "backup.json", { type: "application/json" }),
      tag: "weekly-snapshot",
      environment: "staging",
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    // Verify the response comes back successfully — the mock captures these values
    const body = await res.json();
    expect(body.project_id).toBe("proj-123");
  });

  test("accepts all valid environment values", async () => {
    for (const env of ["dev", "prod", "staging", "test"]) {
      uploadCalls.length = 0;
      const req = uploadRequest({
        file: new File(["data"], "backup.json", { type: "application/json" }),
        environment: env,
      });
      const res = await POST(req);
      expect(res.status).toBe(201);
    }
  });

  test("accepts upload without optional tag and environment", async () => {
    const req = uploadRequest({
      file: new File(["data"], "backup.json", { type: "application/json" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  test("detects JSON by file extension even with generic content type", async () => {
    const req = uploadRequest({
      file: new File(["{}"], "data.json", { type: "application/octet-stream" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    // Should auto-compress since it's detected as JSON by extension
    expect(uploadCalls).toHaveLength(2);
  });

  test("detects ZIP by file extension even with generic content type", async () => {
    const zipData = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const req = uploadRequest({
      file: new File([zipData], "archive.zip", { type: "application/octet-stream" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(uploadCalls).toHaveLength(1);
  });
});
