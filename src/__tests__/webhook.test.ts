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
}));

mock.module("@/lib/r2/client", () => ({
  uploadToR2: async () => {},
}));

const { POST, HEAD } = await import("@/app/api/webhook/[projectId]/route");

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
