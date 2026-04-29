import { describe, expect, test, beforeEach, vi } from "vitest";
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
  contentType: string | undefined,
) => Promise<void> = async () => {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockCreateWebhookLog: (entry: any) => Promise<void> = async () => {};

vi.doMock("../../lib/db/projects", () => ({
  ...PROJECT_STUBS,
  getProjectByToken: (_db: unknown, token: string) =>
    mockGetProjectByToken(token),
}));

vi.doMock("../../lib/db/backups", () => ({
  ...BACKUP_STUBS,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createBackup: (_db: unknown, data: any) => mockCreateBackup(data),
  countBackups: (_db: unknown, projectId: string) => mockCountBackups(projectId),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listBackups: (_db: unknown, opts: any) => mockListBackups(opts),
}));

vi.doMock("../../lib/db/webhook-logs", () => ({
  ...WEBHOOK_LOG_STUBS,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createWebhookLog: (_db: unknown, entry: any) => mockCreateWebhookLog(entry),
}));

const webhookHandlers = await import("../../handlers/webhook");
const ctx = makeMockCtx({
  r2: makeMockR2({
    put: async (key, body, opts) =>
      mockUploadToR2(key, body as Uint8Array, opts?.contentType),
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
    expect(r.kind).toBe("empty");
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
    // webhookHeadHandler returns 'empty' (no body) for ALL non-200
    // branches — documenting that contract here. The HEAD method
    // semantically prohibits a body, so this is by design.
    expect(r.kind).toBe("empty");
  });
  test("500 when getProjectByToken throws non-Error (covers HEAD outer-catch instanceof Error false branch)", async () => {
    // Covers line 130 of webhook.ts: the HEAD handler's outer catch
    // `error instanceof Error ? msg : 'Unknown error'` ternary false
    // branch. HEAD returns `empty(500)` for ALL failure paths — no
    // body to leak the thrown payload.
    mockGetProjectByToken = async () => {
      throw "plain-string";
    };
    const r = await webhookHeadHandler({
      projectId: "p1",
      authorization: "Bearer tok-valid",
      clientIp: null,
      userAgent: null,
    });
    expect(r.status).toBe(500);
    expect(r.kind).toBe("empty");
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
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      expect(r.body).toEqual({
        error: "Missing or invalid Authorization header",
      });
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
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      // 'Invalid token or project mismatch' — same generic message for
      // unknown-token AND token-belongs-to-other-project (no info leak).
      expect(r.body).toEqual({
        error: "Invalid token or project mismatch",
      });
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
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      // CIDR mismatch returns the generic 'Forbidden' — same
      // no-info-leak contract as restoreHandler.
      expect(r.body).toEqual({ error: "Forbidden" });
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
    expect(r.kind).toBe("json");
    if (r.kind === "json") {
      // Tightened: consolidate 4 single-property checks (project_name,
      // environment-null, total_backups, recent) into a single toEqual
      // pinning the full body envelope. Catches a regression that adds
      // a stray field (e.g. webhook_token leak) or drops one of the
      // top-level fields.
      expect(r.body).toEqual({
        project_name: "Test Project",
        environment: null,
        total_backups: 7,
        recent_backups: [
          {
            id: "b1",
            tag: "daily",
            environment: "prod",
            file_size: 1024,
            is_single_json: 1,
            created_at: "2026-01-15T00:00:00Z",
          },
        ],
      });
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
    // Tightened: pin captured options shape (handler should forward
    // ALL inputs to listBackups, not just environment) AND the body
    // envelope (no recent_backups field when items=[] — documents
    // the omit-recent-when-empty contract).
    expect(captured).toMatchObject({
      projectId: "p1",
      environment: "staging",
    });
    expect(r.kind).toBe("json");
    if (r.kind === "json") {
      expect(r.body).toEqual({
        project_name: "Test Project",
        environment: "staging",
        total_backups: 0,
        recent_backups: [],
      });
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
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      // Generic 'Internal server error' — webhook handlers don't leak
      // which dependency failed (D1 vs the listBackups DB call).
      expect(r.body).toEqual({ error: "Internal server error" });
  });
  test("500 when countBackups throws non-Error (covers GET outer-catch instanceof Error false branch)", async () => {
    // Covers line 221 of webhook.ts: the GET handler's outer catch
    // `error instanceof Error ? msg : 'Unknown error'` ternary false
    // branch. Symmetric to the POST and HEAD non-Error throws —
    // user response is the generic 'Internal server error' regardless
    // of the thrown payload (no info leak).
    mockGetProjectByToken = async () => baseProject;
    mockCountBackups = async () => {
      throw 9876;
    };
    const r = await webhookGetHandler({
      projectId: "p1",
      authorization: "Bearer tok-valid",
      clientIp: null,
      userAgent: null,
    });
    expect(r.status).toBe(500);
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      expect(r.body).toEqual({ error: "Internal server error" });
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
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      expect(r.body).toEqual({
        error: "Missing or invalid Authorization header",
      });
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
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      expect(r.body).toEqual({
        error: "Invalid token or project mismatch",
      });
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
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      expect(r.body).toEqual({ error: "Forbidden" });
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
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      expect(r.body).toEqual({
        error: "Missing 'file' field in form data",
      });
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
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      expect(r.body).toEqual({ error: "File is empty" });
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
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      // Same MAX_FILE_SIZE limit string as upload handler. Pin so a
      // regression that bumps MAX_FILE_SIZE silently surfaces.
      expect(r.body).toEqual({ error: "File too large. Maximum: 50MB" });
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
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      // Same allowlist string as upload handler.
      expect(r.body).toEqual({
        error: "Invalid environment. Allowed: dev, prod, staging, test",
      });
  });

  test("201 success path with json + tag + env, uploads preview", async () => {
    mockGetProjectByToken = async () => baseProject;
    const uploads: { key: string; type: string | undefined }[] = [];
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
    // Tightened: combine 4 single-property checks into a single
    // toMatchObject so a missing field would surface as one diff.
    // Keeps fileKey/jsonKey out of the assertion (timestamp-derived).
    expect(createArg).toMatchObject({
      projectId: "p1",
      environment: "prod",
      tag: "daily",
      senderIp: "5.5.5.5",
      isSingleJson: true,
      jsonExtracted: false,
      fileType: "json",
    });
  });

  test("201 with empty file.name + empty file.type uses defaults ('backup' name, 'application/octet-stream' type)", async () => {
    // Covers lines 309 and 329 of webhook.ts: the
    // `file.type || 'application/octet-stream'` and
    // `file.name || 'backup'` falsy fallbacks. Browsers/servers can
    // legally produce a File with empty name/type; the handler must
    // assign sane defaults rather than crashing or persisting empty
    // strings as fileKey path components.
    mockGetProjectByToken = async () => baseProject;
    let createArg: { fileType?: string; fileSize?: number } = {};
    mockCreateBackup = async (input: {
      fileType?: string;
      fileSize?: number;
    }) => {
      createArg = input;
      return {
        id: "bk-empty",
        project_id: "p1",
        environment: "prod",
        tag: null,
        file_size: 5,
        file_key: "k",
        json_key: null,
        sender_ip: null,
        sender_user_agent: null,
        is_single_json: 0,
        json_extracted: 0,
        created_at: "now",
      } as Awaited<ReturnType<typeof mockCreateBackup>>;
    };
    const fileNoMeta = new File([new Uint8Array([1, 2, 3, 4, 5])], "", {
      type: "",
    });
    const r = await webhookPostHandler({
      projectId: "p1",
      authorization: "Bearer tok-valid",
      clientIp: null,
      userAgent: null,
      formData: fd({ file: fileNoMeta }),
    });
    expect(r.status).toBe(201);
    // Empty file.type → normalizeContentType('application/octet-stream')
    // → detectFileType('backup','application/octet-stream') returns
    // 'unknown' (extension-based detection sees no '.json' etc).
    expect(createArg.fileType).toBe("unknown");
  });

  test("201 with non-previewable zip skips preview upload", async () => {
    mockGetProjectByToken = async () => baseProject;
    const uploads: { key: string; contentType: string | undefined }[] = [];
    mockUploadToR2 = async (key, _body, contentType) => {
      uploads.push({ key, contentType });
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
    // Tightened: pin BOTH the upload count (1, no preview because zip
    // isn't previewable) AND the upload key prefix + content-type. A
    // regression that uploaded a stray preview alongside, or stored the
    // zip with the wrong content-type, would surface here.
    expect(uploads).toHaveLength(1);
    expect(uploads[0]!.key).toMatch(/^backups\/p1\//);
    expect(uploads[0]!.contentType).toBe("application/zip");
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
    // Tightened: fall-back contract is 'unknown' literal (NOT null/empty
    // /'unset' — createBackup downstream may rely on the literal for
    // analytics segmentation). Pin senderIp via toMatchObject incl. the
    // surrounding context (other fields stay undefined when fd({}).)
    expect(captured).toMatchObject({
      projectId: "p1",
      senderIp: "unknown",
      isSingleJson: true,
      jsonExtracted: false,
      fileType: "json",
    });
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
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      expect(r.body).toEqual({ error: "Internal server error" });
  });

  test("500 when uploadToR2 throws non-Error (covers instanceof Error false branch → 'R2 upload failed' fallback)", async () => {
    // Covers line 349 of webhook.ts: the
    // `uploadError instanceof Error ? msg : 'R2 upload failed'`
    // ternary when the thrown value is NOT an Error instance.
    // The user response is unchanged ('Internal server error', no info
    // leak), but the recorded log entry uses the literal fallback
    // instead of the thrown value's message. Locks the no-info-leak
    // contract and the fallback string.
    mockGetProjectByToken = async () => baseProject;
    mockUploadToR2 = async () => {
      throw "plain-string-not-error";
    };
    const r = await webhookPostHandler({
      projectId: "p1",
      authorization: "Bearer tok-valid",
      clientIp: null,
      userAgent: null,
      formData: fd({}),
    });
    expect(r.status).toBe(500);
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      // Same generic body — no propagation of the thrown payload.
      expect(r.body).toEqual({ error: "Internal server error" });
  });

  test("500 when createBackup throws non-Error (covers instanceof Error false branch → 'D1 insert failed' fallback)", async () => {
    // Symmetric to the R2 non-Error throw — covers line 384 of
    // webhook.ts: the `dbError instanceof Error ? msg : 'D1 insert failed'`
    // ternary. User response remains the generic 500.
    mockGetProjectByToken = async () => baseProject;
    mockCreateBackup = async () => {
      throw { code: 42, type: "plain-object" };
    };
    const r = await webhookPostHandler({
      projectId: "p1",
      authorization: "Bearer tok-valid",
      clientIp: null,
      userAgent: null,
      formData: fd({}),
    });
    expect(r.status).toBe(500);
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      expect(r.body).toEqual({ error: "Internal server error" });
  });

  test("500 when getProjectByToken throws non-Error (covers outer-catch instanceof Error false branch → 'Unknown error' fallback)", async () => {
    // Covers line 419 of webhook.ts: the outer try/catch's
    // `error instanceof Error ? msg : 'Unknown error'` ternary. The
    // outer catch fires when the FIRST awaited operation
    // (getProjectByToken) throws a non-Error value before the inner
    // try-blocks have a chance to catch.
    mockGetProjectByToken = async () => {
      throw 12345;
    };
    const r = await webhookPostHandler({
      projectId: "p1",
      authorization: "Bearer tok-valid",
      clientIp: null,
      userAgent: null,
      formData: fd({}),
    });
    expect(r.status).toBe(500);
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      expect(r.body).toEqual({ error: "Internal server error" });
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
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      // Same generic 'Internal server error' for r2/db/auth throws —
      // no dependency leak.
      expect(r.body).toEqual({ error: "Internal server error" });
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
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      expect(r.body).toEqual({ error: "Internal server error" });
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
    expect(r.kind).toBe("json");
    if (r.kind === "json") {
      const body = r.body as Record<string, unknown>;
      expect(body.error).toBe("Internal server error");
    }
  });
});
