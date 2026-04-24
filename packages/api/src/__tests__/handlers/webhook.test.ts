import { describe, expect, test, beforeEach, mock } from "bun:test";
import {
  PROJECT_STUBS,
  BACKUP_STUBS,
  WEBHOOK_LOG_STUBS,
  makeMockCtx,
  makeMockR2,
} from "../helpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockGetProjectByToken: (token: string) => Promise<any> = async () =>
  undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockCreateBackup: (data: any) => Promise<any> = async () => ({});
let mockCountBackups: (projectId: string) => Promise<number> = async () => 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockListBackups: (opts: any) => Promise<any> = async () => ({
  items: [],
  total: 0,
  page: 1,
  pageSize: 5,
  totalPages: 0,
});
let mockUploadToR2: (
  key: string,
  body: Uint8Array,
  contentType: string,
) => Promise<void> = async () => {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockCreateWebhookLog: (entry: any) => Promise<void> = async () => {};

mock.module("../../lib/db/projects", () => ({
  ...PROJECT_STUBS,
  getProjectByToken: (_db: unknown, token: string) =>
    mockGetProjectByToken(token),
}));

mock.module("../../lib/db/backups", () => ({
  ...BACKUP_STUBS,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createBackup: (_db: unknown, data: any) => mockCreateBackup(data),
  countBackups: (_db: unknown, projectId: string) => mockCountBackups(projectId),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listBackups: (_db: unknown, opts: any) => mockListBackups(opts),
}));

mock.module("../../lib/db/webhook-logs", () => ({
  ...WEBHOOK_LOG_STUBS,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createWebhookLog: (_db: unknown, entry: any) => mockCreateWebhookLog(entry),
}));

const webhookHandlers = await import("../../handlers/webhook");
const ctx = makeMockCtx({
  r2: makeMockR2({
    put: async (key, body, opts) =>
      mockUploadToR2(key, body as Uint8Array, opts?.contentType ?? "application/octet-stream"),
  }),
});
const webhookHeadHandler = (
  input: Parameters<typeof webhookHandlers.webhookHeadHandler>[0],
) => webhookHandlers.webhookHeadHandler(input, ctx);
const webhookGetHandler = (
  input: Parameters<typeof webhookHandlers.webhookGetHandler>[0],
) => webhookHandlers.webhookGetHandler(input, ctx);
const webhookPostHandler = (
  input: Parameters<typeof webhookHandlers.webhookPostHandler>[0],
) => webhookHandlers.webhookPostHandler(input, ctx);

const baseProject = {
  id: "p1",
  name: "Test Project",
  webhook_token: "tok-valid",
  allowed_ips: null,
};

function makeFile(
  content = "data",
  name = "backup.json",
  type = "application/json",
) {
  return new File([content], name, { type });
}

describe("webhookHeadHandler", () => {
  beforeEach(() => {
    mockGetProjectByToken = async () => undefined;
    mockCreateBackup = async () => ({});
    mockCountBackups = async () => 0;
    mockListBackups = async () => ({
      items: [],
      total: 0,
      page: 1,
      pageSize: 5,
      totalPages: 0,
    });
    mockUploadToR2 = async () => {};
    mockCreateWebhookLog = async () => {};
  });

  test("401 when no Authorization", async () => {
    const r = await webhookHeadHandler({
      projectId: "p1",
      authorization: null,
      clientIp: null,
      userAgent: null,
    });
    expect(r.status).toBe(401);
  });

  test("401 when Authorization not Bearer", async () => {
    const r = await webhookHeadHandler({
      projectId: "p1",
      authorization: "Basic xyz",
      clientIp: null,
      userAgent: null,
    });
    expect(r.status).toBe(401);
  });

  test("403 when project not found", async () => {
    mockGetProjectByToken = async () => undefined;
    const r = await webhookHeadHandler({
      projectId: "p1",
      authorization: "Bearer tok-bad",
      clientIp: null,
      userAgent: null,
    });
    expect(r.status).toBe(403);
  });

  test("403 when project id mismatch", async () => {
    mockGetProjectByToken = async () => ({ ...baseProject, id: "other" });
    const r = await webhookHeadHandler({
      projectId: "p1",
      authorization: "Bearer tok-valid",
      clientIp: null,
      userAgent: null,
    });
    expect(r.status).toBe(403);
  });

  test("403 when IP not allowed", async () => {
    mockGetProjectByToken = async () => ({
      ...baseProject,
      allowed_ips: "10.0.0.0/8",
    });
    const r = await webhookHeadHandler({
      projectId: "p1",
      authorization: "Bearer tok-valid",
      clientIp: "1.2.3.4",
      userAgent: null,
    });
    expect(r.status).toBe(403);
  });

  test("403 when IP allowlist set but clientIp null", async () => {
    mockGetProjectByToken = async () => ({
      ...baseProject,
      allowed_ips: "10.0.0.0/8",
    });
    const r = await webhookHeadHandler({
      projectId: "p1",
      authorization: "Bearer tok-valid",
      clientIp: null,
      userAgent: null,
    });
    expect(r.status).toBe(403);
  });

  test("200 with X-Project-Name when valid", async () => {
    mockGetProjectByToken = async () => baseProject;
    const r = await webhookHeadHandler({
      projectId: "p1",
      authorization: "Bearer tok-valid",
      clientIp: null,
      userAgent: "ua",
    });
    expect(r.status).toBe(200);
    if (r.kind === "empty") {
      expect(r.headers?.["X-Project-Name"]).toBe("Test Project");
    }
  });

  test("500 when getProjectByToken throws", async () => {
    mockGetProjectByToken = async () => {
      throw new Error("db");
    };
    const r = await webhookHeadHandler({
      projectId: "p1",
      authorization: "Bearer tok-valid",
      clientIp: null,
      userAgent: null,
    });
    expect(r.status).toBe(500);
  });
});

describe("webhookGetHandler", () => {
  beforeEach(() => {
    mockGetProjectByToken = async () => undefined;
    mockCountBackups = async () => 0;
    mockListBackups = async () => ({
      items: [],
      total: 0,
      page: 1,
      pageSize: 5,
      totalPages: 0,
    });
    mockCreateWebhookLog = async () => {};
  });

  test("401 when no Authorization", async () => {
    const r = await webhookGetHandler({
      projectId: "p1",
      authorization: null,
      clientIp: null,
      userAgent: null,
    });
    expect(r.status).toBe(401);
  });

  test("403 when token invalid", async () => {
    mockGetProjectByToken = async () => undefined;
    const r = await webhookGetHandler({
      projectId: "p1",
      authorization: "Bearer tok-bad",
      clientIp: null,
      userAgent: null,
    });
    expect(r.status).toBe(403);
  });

  test("403 when IP blocked", async () => {
    mockGetProjectByToken = async () => ({
      ...baseProject,
      allowed_ips: "10.0.0.0/8",
    });
    const r = await webhookGetHandler({
      projectId: "p1",
      authorization: "Bearer tok-valid",
      clientIp: "1.2.3.4",
      userAgent: null,
    });
    expect(r.status).toBe(403);
  });

  test("200 with backup list (no environment)", async () => {
    mockGetProjectByToken = async () => baseProject;
    mockCountBackups = async () => 7;
    mockListBackups = async () => ({
      items: [
        {
          id: "b1",
          tag: "daily",
          environment: "prod",
          file_size: 1024,
          is_single_json: 1,
          created_at: "2026-01-15T00:00:00Z",
          file_key: "secret-key",
          sender_ip: "should-not-leak",
        },
      ],
      total: 7,
      page: 1,
      pageSize: 5,
      totalPages: 2,
    });
    const r = await webhookGetHandler({
      projectId: "p1",
      authorization: "Bearer tok-valid",
      clientIp: null,
      userAgent: null,
    });
    expect(r.status).toBe(200);
    if (r.kind === "json") {
      const body = r.body as Record<string, unknown>;
      expect(body.project_name).toBe("Test Project");
      expect(body.environment).toBeNull();
      expect(body.total_backups).toBe(7);
      const recent = body.recent_backups as Record<string, unknown>[];
      expect(recent).toHaveLength(1);
      expect(recent[0]).not.toHaveProperty("file_key");
      expect(recent[0]).not.toHaveProperty("sender_ip");
      expect(recent[0]?.id).toBe("b1");
    }
  });

  test("200 forwards environment filter", async () => {
    mockGetProjectByToken = async () => baseProject;
    let captured: Record<string, unknown> | undefined;
    mockListBackups = async (opts) => {
      captured = opts;
      return {
        items: [],
        total: 0,
        page: 1,
        pageSize: 5,
        totalPages: 0,
      };
    };
    const r = await webhookGetHandler({
      projectId: "p1",
      authorization: "Bearer tok-valid",
      clientIp: null,
      userAgent: null,
      environment: "staging",
    });
    expect(r.status).toBe(200);
    expect(captured?.environment).toBe("staging");
    if (r.kind === "json") {
      expect((r.body as Record<string, unknown>).environment).toBe("staging");
    }
  });

  test("500 when countBackups throws", async () => {
    mockGetProjectByToken = async () => baseProject;
    mockCountBackups = async () => {
      throw new Error("db");
    };
    const r = await webhookGetHandler({
      projectId: "p1",
      authorization: "Bearer tok-valid",
      clientIp: null,
      userAgent: null,
    });
    expect(r.status).toBe(500);
  });
});

describe("webhookPostHandler", () => {
  beforeEach(() => {
    mockGetProjectByToken = async () => undefined;
    mockCreateBackup = async () => ({
      id: "bk-new",
      project_id: "p1",
      file_size: 4,
      created_at: "2026-01-01T00:00:00Z",
    });
    mockUploadToR2 = async () => {};
    mockCreateWebhookLog = async () => {};
  });

  function fd(parts: {
    file?: File | null;
    environment?: string;
    tag?: string;
  }): () => Promise<FormData> {
    const f = new FormData();
    if (parts.file !== null && parts.file !== undefined) {
      f.append("file", parts.file);
    } else if (parts.file === undefined) {
      f.append("file", makeFile());
    }
    if (parts.environment) f.append("environment", parts.environment);
    if (parts.tag) f.append("tag", parts.tag);
    return async () => f;
  }

  test("401 when no Authorization", async () => {
    const r = await webhookPostHandler({
      projectId: "p1",
      authorization: null,
      clientIp: null,
      userAgent: null,
      formData: fd({}),
    });
    expect(r.status).toBe(401);
  });

  test("403 when token invalid", async () => {
    const r = await webhookPostHandler({
      projectId: "p1",
      authorization: "Bearer bad",
      clientIp: null,
      userAgent: null,
      formData: fd({}),
    });
    expect(r.status).toBe(403);
  });

  test("403 when IP blocked", async () => {
    mockGetProjectByToken = async () => ({
      ...baseProject,
      allowed_ips: "10.0.0.0/8",
    });
    const r = await webhookPostHandler({
      projectId: "p1",
      authorization: "Bearer tok-valid",
      clientIp: "1.2.3.4",
      userAgent: null,
      formData: fd({}),
    });
    expect(r.status).toBe(403);
  });

  test("400 when file missing", async () => {
    mockGetProjectByToken = async () => baseProject;
    const r = await webhookPostHandler({
      projectId: "p1",
      authorization: "Bearer tok-valid",
      clientIp: null,
      userAgent: null,
      formData: fd({ file: null }),
    });
    expect(r.status).toBe(400);
  });

  test("400 when file empty", async () => {
    mockGetProjectByToken = async () => baseProject;
    const r = await webhookPostHandler({
      projectId: "p1",
      authorization: "Bearer tok-valid",
      clientIp: null,
      userAgent: null,
      formData: fd({ file: new File([], "x.json", { type: "application/json" }) }),
    });
    expect(r.status).toBe(400);
  });

  test("413 when file too large", async () => {
    mockGetProjectByToken = async () => baseProject;
    const big = new Uint8Array(50 * 1024 * 1024 + 1);
    const r = await webhookPostHandler({
      projectId: "p1",
      authorization: "Bearer tok-valid",
      clientIp: null,
      userAgent: null,
      formData: fd({
        file: new File([big], "big.bin", { type: "application/octet-stream" }),
      }),
    });
    expect(r.status).toBe(413);
  });

  test("400 when environment invalid", async () => {
    mockGetProjectByToken = async () => baseProject;
    const r = await webhookPostHandler({
      projectId: "p1",
      authorization: "Bearer tok-valid",
      clientIp: null,
      userAgent: null,
      formData: fd({ environment: "bogus" }),
    });
    expect(r.status).toBe(400);
  });

  test("201 success path with json + tag + env, uploads preview", async () => {
    mockGetProjectByToken = async () => baseProject;
    const uploads: { key: string; type: string }[] = [];
    mockUploadToR2 = async (key, _body, contentType) => {
      uploads.push({ key, type: contentType });
    };
    let createArg: Record<string, unknown> | undefined;
    mockCreateBackup = async (data) => {
      createArg = data;
      return {
        id: "bk-new",
        project_id: "p1",
        file_size: data.fileSize,
        created_at: "2026-01-01T00:00:00Z",
      };
    };
    const r = await webhookPostHandler({
      projectId: "p1",
      authorization: "Bearer tok-valid",
      clientIp: "5.5.5.5",
      userAgent: "ua",
      formData: fd({ environment: "prod", tag: "daily" }),
    });
    expect(r.status).toBe(201);
    expect(uploads.length).toBe(2);
    expect(uploads[1]?.type).toBe("application/json");
    expect(createArg?.environment).toBe("prod");
    expect(createArg?.tag).toBe("daily");
    expect(createArg?.senderIp).toBe("5.5.5.5");
    expect(createArg?.isSingleJson).toBe(true);
  });

  test("201 with non-previewable zip skips preview upload", async () => {
    mockGetProjectByToken = async () => baseProject;
    const uploads: string[] = [];
    mockUploadToR2 = async (key) => {
      uploads.push(key);
    };
    const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    const r = await webhookPostHandler({
      projectId: "p1",
      authorization: "Bearer tok-valid",
      clientIp: null,
      userAgent: null,
      formData: fd({
        file: new File([zipBytes], "x.zip", { type: "application/zip" }),
      }),
    });
    expect(r.status).toBe(201);
    expect(uploads.length).toBe(1);
  });

  test("senderIp falls back to 'unknown' when clientIp null", async () => {
    mockGetProjectByToken = async () => baseProject;
    let captured: Record<string, unknown> | undefined;
    mockCreateBackup = async (data) => {
      captured = data;
      return {
        id: "x",
        project_id: "p1",
        file_size: 1,
        created_at: "2026-01-01T00:00:00Z",
      };
    };
    const r = await webhookPostHandler({
      projectId: "p1",
      authorization: "Bearer tok-valid",
      clientIp: null,
      userAgent: null,
      formData: fd({}),
    });
    expect(r.status).toBe(201);
    expect(captured?.senderIp).toBe("unknown");
  });

  test("500 when uploadToR2 throws", async () => {
    mockGetProjectByToken = async () => baseProject;
    mockUploadToR2 = async () => {
      throw new Error("r2");
    };
    const r = await webhookPostHandler({
      projectId: "p1",
      authorization: "Bearer tok-valid",
      clientIp: null,
      userAgent: null,
      formData: fd({}),
    });
    expect(r.status).toBe(500);
  });

  test("500 when createBackup throws", async () => {
    mockGetProjectByToken = async () => baseProject;
    mockCreateBackup = async () => {
      throw new Error("db");
    };
    const r = await webhookPostHandler({
      projectId: "p1",
      authorization: "Bearer tok-valid",
      clientIp: null,
      userAgent: null,
      formData: fd({}),
    });
    expect(r.status).toBe(500);
  });

  test("500 when getProjectByToken throws", async () => {
    mockGetProjectByToken = async () => {
      throw new Error("db");
    };
    const r = await webhookPostHandler({
      projectId: "p1",
      authorization: "Bearer tok-valid",
      clientIp: null,
      userAgent: null,
      formData: fd({}),
    });
    expect(r.status).toBe(500);
  });

  test("500 when formData() throws (multipart parse failure)", async () => {
    mockGetProjectByToken = async () => baseProject;
    const r = await webhookPostHandler({
      projectId: "p1",
      authorization: "Bearer tok-valid",
      clientIp: null,
      userAgent: null,
      formData: async () => {
        throw new Error("malformed multipart body");
      },
    });
    expect(r.status).toBe(500);
    if (r.kind === "json") {
      const body = r.body as Record<string, unknown>;
      expect(body.error).toBe("Internal server error");
    }
  });
});
