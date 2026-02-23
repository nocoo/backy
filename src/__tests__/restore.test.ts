import { describe, expect, test, mock } from "bun:test";

// Mock DB and R2 before importing the route
mock.module("@/lib/db/backups", () => ({
  getBackup: async (id: string) => {
    if (id === "backup-open") {
      return {
        id: "backup-open",
        project_id: "proj-open",
        file_key: "backups/proj-open/2026-01-01.json",
        file_size: 1024,
      };
    }
    if (id === "backup-restricted") {
      return {
        id: "backup-restricted",
        project_id: "proj-restricted",
        file_key: "backups/proj-restricted/2026-01-01.json",
        file_size: 2048,
      };
    }
    return undefined;
  },
  // Stub exports used by other test files to avoid module resolution errors
  createBackup: async () => ({}),
  listBackups: async () => ({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 }),
  countBackups: async () => 0,
  deleteBackups: async () => {},
}));

mock.module("@/lib/db/projects", () => ({
  getProject: async (id: string) => {
    if (id === "proj-open") {
      return {
        id: "proj-open",
        name: "Open Project",
        webhook_token: "open-token",
        allowed_ips: null,
      };
    }
    if (id === "proj-restricted") {
      return {
        id: "proj-restricted",
        name: "Restricted Project",
        webhook_token: "restricted-token",
        allowed_ips: "10.0.0.0/8,192.168.0.0/16",
      };
    }
    return undefined;
  },
  // Stub exports used by other test files
  getProjectByToken: async () => undefined,
  listProjects: async () => [],
  createProject: async () => ({}),
  updateProject: async () => ({}),
  deleteProject: async () => {},
}));

mock.module("@/lib/r2/client", () => ({
  createPresignedDownloadUrl: async () => "https://r2.example.com/signed-url",
  // Stub exports used by other test files
  uploadToR2: async () => {},
  deleteFromR2: async () => {},
  isR2Configured: () => true,
  pingR2: async () => {},
  resetR2Client: () => {},
}));

const { GET } = await import("@/app/api/restore/[id]/route");

describe("GET /api/restore/[id]", () => {
  test("returns 401 without token", async () => {
    const req = new Request("http://localhost:7026/api/restore/backup-open");
    const params = Promise.resolve({ id: "backup-open" });
    const res = await GET(req, { params });
    expect(res.status).toBe(401);
  });

  test("returns 404 for non-existent backup", async () => {
    const req = new Request("http://localhost:7026/api/restore/no-exist?token=open-token");
    const params = Promise.resolve({ id: "no-exist" });
    const res = await GET(req, { params });
    expect(res.status).toBe(404);
  });

  test("returns 403 with wrong token", async () => {
    const req = new Request("http://localhost:7026/api/restore/backup-open?token=wrong-token");
    const params = Promise.resolve({ id: "backup-open" });
    const res = await GET(req, { params });
    expect(res.status).toBe(403);
  });

  test("returns presigned URL with valid query param token", async () => {
    const req = new Request("http://localhost:7026/api/restore/backup-open?token=open-token");
    const params = Promise.resolve({ id: "backup-open" });
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe("https://r2.example.com/signed-url");
    expect(body.backup_id).toBe("backup-open");
    expect(body.expires_in).toBe(900);
  });

  test("returns presigned URL with Bearer token", async () => {
    const req = new Request("http://localhost:7026/api/restore/backup-open", {
      headers: { Authorization: "Bearer open-token" },
    });
    const params = Promise.resolve({ id: "backup-open" });
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
  });
});

describe("GET /api/restore/[id] — IP restriction", () => {
  test("returns 200 when IP is in allowed range", async () => {
    const req = new Request("http://localhost:7026/api/restore/backup-restricted?token=restricted-token", {
      headers: { "x-forwarded-for": "10.5.5.5" },
    });
    const params = Promise.resolve({ id: "backup-restricted" });
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.backup_id).toBe("backup-restricted");
  });

  test("returns 200 with second allowed range (192.168.x.x)", async () => {
    const req = new Request("http://localhost:7026/api/restore/backup-restricted?token=restricted-token", {
      headers: { "x-forwarded-for": "192.168.50.1" },
    });
    const params = Promise.resolve({ id: "backup-restricted" });
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
  });

  test("returns 403 when IP is outside allowed range", async () => {
    const req = new Request("http://localhost:7026/api/restore/backup-restricted?token=restricted-token", {
      headers: { "x-forwarded-for": "172.16.0.1" },
    });
    const params = Promise.resolve({ id: "backup-restricted" });
    const res = await GET(req, { params });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Forbidden");
  });

  test("returns 403 when no x-forwarded-for on restricted project", async () => {
    const req = new Request("http://localhost:7026/api/restore/backup-restricted?token=restricted-token");
    const params = Promise.resolve({ id: "backup-restricted" });
    const res = await GET(req, { params });
    expect(res.status).toBe(403);
  });

  test("open project allows any IP", async () => {
    const req = new Request("http://localhost:7026/api/restore/backup-open?token=open-token", {
      headers: { "x-forwarded-for": "8.8.8.8" },
    });
    const params = Promise.resolve({ id: "backup-open" });
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
  });
});
