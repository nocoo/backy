import { describe, expect, test, mock } from "bun:test";

// Mock D1 and R2 before importing the route
mock.module("@/lib/db/projects", () => ({
  getProjectByToken: async (token: string) => {
    if (token === "valid-token") {
      return {
        id: "proj-123",
        name: "Test Project",
        description: null,
        webhook_token: "valid-token",
        allowed_ips: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      };
    }
    if (token === "ip-restricted-token") {
      return {
        id: "proj-456",
        name: "IP Restricted Project",
        description: null,
        webhook_token: "ip-restricted-token",
        allowed_ips: "10.0.0.0/8,192.168.1.0/24",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      };
    }
    return undefined;
  },
}));

mock.module("@/lib/db/backups", () => ({
  createBackup: async (data: Record<string, unknown>) => ({
    id: "backup-123",
    project_id: data.projectId,
    environment: data.environment ?? null,
    sender_ip: data.senderIp,
    tag: data.tag ?? null,
    file_key: data.fileKey,
    json_key: data.jsonKey ?? null,
    file_size: data.fileSize,
    is_single_json: data.isSingleJson ? 1 : 0,
    json_extracted: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  }),
  listBackups: async (options: Record<string, unknown>) => ({
    items: [
      {
        id: "b1",
        project_id: "proj-123",
        project_name: "Test Project",
        environment: options.environment ?? "prod",
        tag: "daily-backup",
        file_key: "backups/proj-123/2026-01-01.json",
        json_key: "previews/proj-123/2026-01-01.json",
        file_size: 1024,
        is_single_json: 1,
        json_extracted: 0,
        sender_ip: "1.2.3.4",
        created_at: "2026-01-15T10:00:00.000Z",
        updated_at: "2026-01-15T10:00:00.000Z",
      },
      {
        id: "b2",
        project_id: "proj-123",
        project_name: "Test Project",
        environment: options.environment ?? "dev",
        tag: null,
        file_key: "backups/proj-123/2026-01-02.zip",
        json_key: null,
        file_size: 2048,
        is_single_json: 0,
        json_extracted: 0,
        sender_ip: "5.6.7.8",
        created_at: "2026-01-14T10:00:00.000Z",
        updated_at: "2026-01-14T10:00:00.000Z",
      },
    ],
    total: 2,
    page: 1,
    pageSize: 5,
    totalPages: 1,
  }),
  countBackups: async () => 7,
}));

mock.module("@/lib/r2/client", () => ({
  uploadToR2: async () => {},
  isR2Configured: () => true,
  pingR2: async () => {},
  resetR2Client: () => {},
}));

mock.module("@/lib/db/webhook-logs", () => ({
  createWebhookLog: async () => {},
}));

const { POST, HEAD, GET } = await import("@/app/api/webhook/[projectId]/route");

function createRequest(options: {
  token?: string;
  file?: File | null;
  environment?: string;
  tag?: string;
  projectId?: string;
}) {
  const headers = new Headers();
  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const formData = new FormData();
  if (options.file !== null) {
    const file = options.file ?? new File(["backup content"], "backup.json", {
      type: "application/json",
    });
    formData.append("file", file);
  }
  if (options.environment) {
    formData.append("environment", options.environment);
  }
  if (options.tag) {
    formData.append("tag", options.tag);
  }

  return new Request("http://localhost:7026/api/webhook/proj-123", {
    method: "POST",
    headers,
    body: formData,
  });
}

describe("POST /api/webhook/[projectId]", () => {
  const params = Promise.resolve({ projectId: "proj-123" });

  test("rejects requests without Authorization header", async () => {
    const req = createRequest({ projectId: "proj-123" });
    const res = await POST(req, { params });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("Authorization");
  });

  test("rejects requests with invalid token", async () => {
    const req = createRequest({ token: "wrong-token" });
    const res = await POST(req, { params });
    expect(res.status).toBe(403);
  });

  test("rejects requests with project ID mismatch", async () => {
    const req = createRequest({ token: "valid-token" });
    const wrongParams = Promise.resolve({ projectId: "wrong-id" });
    const res = await POST(req, { params: wrongParams });
    expect(res.status).toBe(403);
  });

  test("rejects requests without file", async () => {
    const formData = new FormData();
    const req = new Request("http://localhost:7026/api/webhook/proj-123", {
      method: "POST",
      headers: { Authorization: "Bearer valid-token" },
      body: formData,
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("file");
  });

  test("rejects empty files", async () => {
    const emptyFile = new File([], "empty.json", { type: "application/json" });
    const req = createRequest({ token: "valid-token", file: emptyFile });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("empty");
  });

  test("rejects invalid environment values", async () => {
    const req = createRequest({
      token: "valid-token",
      environment: "invalid-env",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("environment");
  });

  test("accepts valid JSON backup", async () => {
    const req = createRequest({
      token: "valid-token",
      environment: "prod",
      tag: "daily-backup",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("backup-123");
    expect(body.project_id).toBe("proj-123");
  });

  test("accepts valid zip backup", async () => {
    const zipFile = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], "backup.zip", {
      type: "application/zip",
    });
    const req = createRequest({ token: "valid-token", file: zipFile });
    const res = await POST(req, { params });
    expect(res.status).toBe(201);
  });

  test("accepts staging environment", async () => {
    const req = createRequest({
      token: "valid-token",
      environment: "staging",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(201);
  });
});

describe("HEAD /api/webhook/[projectId]", () => {
  const params = Promise.resolve({ projectId: "proj-123" });

  test("returns 200 with valid token and matching project", async () => {
    const req = new Request("http://localhost:7026/api/webhook/proj-123", {
      method: "HEAD",
      headers: { Authorization: "Bearer valid-token" },
    });
    const res = await HEAD(req, { params });
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
    expect(res.headers.get("X-Project-Name")).toBe("Test Project");
  });

  test("returns 401 without Authorization header", async () => {
    const req = new Request("http://localhost:7026/api/webhook/proj-123", {
      method: "HEAD",
    });
    const res = await HEAD(req, { params });
    expect(res.status).toBe(401);
    expect(res.body).toBeNull();
  });

  test("returns 403 with invalid token", async () => {
    const req = new Request("http://localhost:7026/api/webhook/proj-123", {
      method: "HEAD",
      headers: { Authorization: "Bearer wrong-token" },
    });
    const res = await HEAD(req, { params });
    expect(res.status).toBe(403);
    expect(res.body).toBeNull();
  });

  test("returns 403 with project ID mismatch", async () => {
    const req = new Request("http://localhost:7026/api/webhook/wrong-id", {
      method: "HEAD",
      headers: { Authorization: "Bearer valid-token" },
    });
    const wrongParams = Promise.resolve({ projectId: "wrong-id" });
    const res = await HEAD(req, { params: wrongParams });
    expect(res.status).toBe(403);
    expect(res.body).toBeNull();
  });

  test("returns 401 with malformed Authorization header", async () => {
    const req = new Request("http://localhost:7026/api/webhook/proj-123", {
      method: "HEAD",
      headers: { Authorization: "Basic dXNlcjpwYXNz" },
    });
    const res = await HEAD(req, { params });
    expect(res.status).toBe(401);
    expect(res.body).toBeNull();
  });
});

describe("GET /api/webhook/[projectId]", () => {
  const params = Promise.resolve({ projectId: "proj-123" });

  test("returns 401 without Authorization header", async () => {
    const req = new Request("http://localhost:7026/api/webhook/proj-123");
    const res = await GET(req, { params });
    expect(res.status).toBe(401);
  });

  test("returns 403 with invalid token", async () => {
    const req = new Request("http://localhost:7026/api/webhook/proj-123", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    const res = await GET(req, { params });
    expect(res.status).toBe(403);
  });

  test("returns 403 with project ID mismatch", async () => {
    const req = new Request("http://localhost:7026/api/webhook/wrong-id", {
      headers: { Authorization: "Bearer valid-token" },
    });
    const wrongParams = Promise.resolve({ projectId: "wrong-id" });
    const res = await GET(req, { params: wrongParams });
    expect(res.status).toBe(403);
  });

  test("returns backup status with valid token", async () => {
    const req = new Request("http://localhost:7026/api/webhook/proj-123", {
      headers: { Authorization: "Bearer valid-token" },
    });
    const res = await GET(req, { params });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.project_name).toBe("Test Project");
    expect(body.environment).toBeNull();
    expect(body.total_backups).toBe(7);
    expect(body.recent_backups).toHaveLength(2);
    expect(body.recent_backups[0].id).toBe("b1");
    expect(body.recent_backups[0].tag).toBe("daily-backup");
    expect(body.recent_backups[0].file_size).toBe(1024);
    expect(body.recent_backups[0].created_at).toBeDefined();
  });

  test("passes environment filter to query", async () => {
    const req = new Request("http://localhost:7026/api/webhook/proj-123?environment=prod", {
      headers: { Authorization: "Bearer valid-token" },
    });
    const res = await GET(req, { params });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.environment).toBe("prod");
    expect(body.recent_backups).toHaveLength(2);
  });

  test("returns only essential fields in recent_backups", async () => {
    const req = new Request("http://localhost:7026/api/webhook/proj-123", {
      headers: { Authorization: "Bearer valid-token" },
    });
    const res = await GET(req, { params });
    const body = await res.json();

    const backup = body.recent_backups[0];
    // Should include these fields
    expect(backup).toHaveProperty("id");
    expect(backup).toHaveProperty("tag");
    expect(backup).toHaveProperty("environment");
    expect(backup).toHaveProperty("file_size");
    expect(backup).toHaveProperty("is_single_json");
    expect(backup).toHaveProperty("created_at");
    // Should NOT include internal fields
    expect(backup).not.toHaveProperty("file_key");
    expect(backup).not.toHaveProperty("json_key");
    expect(backup).not.toHaveProperty("sender_ip");
  });
});

describe("IP restriction enforcement", () => {
  const ipParams = Promise.resolve({ projectId: "proj-456" });

  describe("HEAD — IP check", () => {
    test("returns 200 when IP is in allowed range", async () => {
      const req = new Request("http://localhost:7026/api/webhook/proj-456", {
        method: "HEAD",
        headers: {
          Authorization: "Bearer ip-restricted-token",
          "x-forwarded-for": "10.1.2.3",
        },
      });
      const res = await HEAD(req, { params: ipParams });
      expect(res.status).toBe(200);
    });

    test("returns 403 when IP is outside allowed range", async () => {
      const req = new Request("http://localhost:7026/api/webhook/proj-456", {
        method: "HEAD",
        headers: {
          Authorization: "Bearer ip-restricted-token",
          "x-forwarded-for": "172.16.0.1",
        },
      });
      const res = await HEAD(req, { params: ipParams });
      expect(res.status).toBe(403);
    });

    test("returns 403 when no x-forwarded-for header on IP-restricted project", async () => {
      const req = new Request("http://localhost:7026/api/webhook/proj-456", {
        method: "HEAD",
        headers: { Authorization: "Bearer ip-restricted-token" },
      });
      const res = await HEAD(req, { params: ipParams });
      expect(res.status).toBe(403);
    });
  });

  describe("GET — IP check", () => {
    test("returns 200 when IP is in allowed range", async () => {
      const req = new Request("http://localhost:7026/api/webhook/proj-456", {
        headers: {
          Authorization: "Bearer ip-restricted-token",
          "x-forwarded-for": "192.168.1.100",
        },
      });
      const res = await GET(req, { params: ipParams });
      expect(res.status).toBe(200);
    });

    test("returns 403 when IP is outside allowed range", async () => {
      const req = new Request("http://localhost:7026/api/webhook/proj-456", {
        headers: {
          Authorization: "Bearer ip-restricted-token",
          "x-forwarded-for": "8.8.8.8",
        },
      });
      const res = await GET(req, { params: ipParams });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain("Forbidden");
    });
  });

  describe("POST — IP check", () => {
    test("returns 201 when IP is in allowed range", async () => {
      const formData = new FormData();
      formData.append("file", new File(["data"], "backup.json", { type: "application/json" }));
      const req = new Request("http://localhost:7026/api/webhook/proj-456", {
        method: "POST",
        headers: {
          Authorization: "Bearer ip-restricted-token",
          "x-forwarded-for": "10.0.0.1",
        },
        body: formData,
      });
      const res = await POST(req, { params: ipParams });
      expect(res.status).toBe(201);
    });

    test("returns 403 when IP is outside allowed range", async () => {
      const formData = new FormData();
      formData.append("file", new File(["data"], "backup.json", { type: "application/json" }));
      const req = new Request("http://localhost:7026/api/webhook/proj-456", {
        method: "POST",
        headers: {
          Authorization: "Bearer ip-restricted-token",
          "x-forwarded-for": "1.2.3.4",
        },
        body: formData,
      });
      const res = await POST(req, { params: ipParams });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain("Forbidden");
    });
  });

  describe("project without IP restriction is unaffected", () => {
    const openParams = Promise.resolve({ projectId: "proj-123" });

    test("HEAD allows any IP when allowed_ips is null", async () => {
      const req = new Request("http://localhost:7026/api/webhook/proj-123", {
        method: "HEAD",
        headers: {
          Authorization: "Bearer valid-token",
          "x-forwarded-for": "1.2.3.4",
        },
      });
      const res = await HEAD(req, { params: openParams });
      expect(res.status).toBe(200);
    });

    test("GET allows any IP when allowed_ips is null", async () => {
      const req = new Request("http://localhost:7026/api/webhook/proj-123", {
        headers: {
          Authorization: "Bearer valid-token",
          "x-forwarded-for": "1.2.3.4",
        },
      });
      const res = await GET(req, { params: openParams });
      expect(res.status).toBe(200);
    });
  });
});
