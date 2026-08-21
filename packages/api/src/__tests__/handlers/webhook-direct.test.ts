import { describe, expect, test, beforeEach, vi } from "vitest";
import {
  PROJECT_STUBS,
  BACKUP_STUBS,
  WEBHOOK_LOG_STUBS,
  makeMockCtx,
  makeMockR2,
} from "../helpers";
import type { DirectUploadRow } from "../../lib/db/direct-uploads";

let mockGetProjectByToken: (token: string) => Promise<any> = async () =>
  undefined;
let mockCreateBackup: (data: any) => Promise<any> = async () => ({});
let mockGetBackup: (id: string) => Promise<any> = async () => undefined;
let mockGetBackupByFileKey: (key: string) => Promise<any> = async () =>
  undefined;
let mockInsert: () => Promise<boolean> = async () => true;
let mockGetUpload: () => Promise<DirectUploadRow | undefined> = async () =>
  undefined;
let mockClaim: () => Promise<boolean> = async () => true;
let mockAbortPending: () => Promise<boolean> = async () => true;
const mockAbortLease: () => Promise<void> = async () => {};
let mockRenew: () => Promise<boolean> = async () => true;
let mockComplete: () => Promise<boolean> = async () => true;
const mockAttach: () => Promise<void> = async () => {};

vi.doMock("../../lib/db/projects", () => ({
  ...PROJECT_STUBS,
  getProjectByToken: (_db: unknown, token: string) =>
    mockGetProjectByToken(token),
}));

vi.doMock("../../lib/db/backups", () => ({
  ...BACKUP_STUBS,
  createBackup: (_db: unknown, data: any) => mockCreateBackup(data),
  getBackup: (_db: unknown, id: string) => mockGetBackup(id),
  getBackupByFileKey: (_db: unknown, key: string) => mockGetBackupByFileKey(key),
}));

vi.doMock("../../lib/db/webhook-logs", () => ({
  ...WEBHOOK_LOG_STUBS,
}));

vi.doMock("../../lib/db/direct-uploads", async () => {
  const actual = await vi.importActual<
    typeof import("../../lib/db/direct-uploads")
  >("../../lib/db/direct-uploads");
  return {
    ...actual,
    insertPendingDirectUpload: () => mockInsert(),
    getDirectUpload: () => mockGetUpload(),
    claimDirectUpload: () => mockClaim(),
    abortPendingDirectUpload: () => mockAbortPending(),
    abortCompletingWithLease: () => mockAbortLease(),
    renewDirectUploadLease: () => mockRenew(),
    completeDirectUpload: () => mockComplete(),
    attachCompletedBackup: () => mockAttach(),
  };
});

const handlers = await import("../../handlers/webhook-direct");

const project = {
  id: "p1",
  name: "Test",
  webhook_token: "tok-valid",
  allowed_ips: null,
};

function pending(overrides: Partial<DirectUploadRow> = {}): DirectUploadRow {
  return {
    id: "upload1upload1upload11",
    project_id: "p1",
    file_key: "backups/p1/direct/u.bin",
    staging_key: "direct-staging/p1/u/in.bin",
    file_name: "dump.bin",
    content_type: "application/octet-stream",
    declared_size: 4,
    environment: "prod",
    tag: "nightly",
    sender_ip: "1.2.3.4",
    status: "pending",
    expires_at: 4_000_000_000,
    purge_after: 4_000_001_000,
    reap_until: 4_000_002_000,
    lease_expires_at: null,
    lease_token: null,
    next_gc_at: 4_000_001_000,
    purged_at: null,
    backup_id: null,
    created_at: 1_700_000_000,
    completed_at: null,
    ...overrides,
  };
}

const s3Env = {
  R2_ACCESS_KEY_ID: "id",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_ACCOUNT_ID: "acct",
  R2_BUCKET_NAME: "bucket",
};

function ctx(overrides: Parameters<typeof makeMockCtx>[0] = {}) {
  return makeMockCtx({
    env: s3Env,
    r2: makeMockR2({
      presignUpload: async () =>
        "https://bucket.acct.r2.cloudflarestorage.com/k",
      head: async () => ({ contentLength: 4 }),
    }),
    ...overrides,
  });
}

const auth = {
  projectId: "p1",
  authorization: "Bearer tok-valid",
  clientIp: "1.2.3.4",
  userAgent: "test",
};

describe("webhookInitUploadHandler", () => {
  beforeEach(() => {
    mockGetProjectByToken = async () => project;
    mockInsert = async () => true;
  });

  test("401 without token and 403 on mismatch / ip", async () => {
    mockGetProjectByToken = async () => undefined;
    expect(
      (await handlers.webhookInitUploadHandler(
        { ...auth, authorization: null, body: {} },
        ctx(),
      )).status,
    ).toBe(401);
    expect(
      (await handlers.webhookInitUploadHandler({ ...auth, body: {} }, ctx())).status,
    ).toBe(403);
    mockGetProjectByToken = async () => ({ ...project, allowed_ips: "10.0.0.1/32" });
    expect(
      (await handlers.webhookInitUploadHandler({ ...auth, body: {} }, ctx())).status,
    ).toBe(403);
  });

  test("400 on validation and 5000000001 rejected, 5000000000 accepted", async () => {
    expect(
      (await handlers.webhookInitUploadHandler({ ...auth, body: null }, ctx())).status,
    ).toBe(400);
    expect(
      (
        await handlers.webhookInitUploadHandler(
          { ...auth, body: { file_name: "a/b", file_size: 1 } },
          ctx(),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handlers.webhookInitUploadHandler(
          { ...auth, body: { file_name: "a.bin", file_size: 5_000_000_001 } },
          ctx(),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handlers.webhookInitUploadHandler(
          { ...auth, body: { file_name: "a.bin", file_size: 0 } },
          ctx(),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handlers.webhookInitUploadHandler(
          {
            ...auth,
            body: { file_name: "a.bin", file_size: 1, environment: "nope" },
          },
          ctx(),
        )
      ).status,
    ).toBe(400);
    const ok = await handlers.webhookInitUploadHandler(
      { ...auth, body: { file_name: "a.bin", file_size: 5_000_000_000 } },
      ctx(),
    );
    expect(ok.status).toBe(200);
  });

  test("503 without S3 keys, 429 on quota, 200 with signed headers", async () => {
    const noS3 = await handlers.webhookInitUploadHandler(
      { ...auth, body: { file_name: "a.bin", file_size: 4 } },
      makeMockCtx({
        env: {
          R2_ACCESS_KEY_ID: "",
          R2_SECRET_ACCESS_KEY: "",
          R2_ACCOUNT_ID: "",
          R2_BUCKET_NAME: "",
        },
      }),
    );
    expect(noS3.status).toBe(503);
    mockInsert = async () => false;
    expect(
      (
        await handlers.webhookInitUploadHandler(
          { ...auth, body: { file_name: "a.bin", file_size: 4 } },
          ctx(),
        )
      ).status,
    ).toBe(429);
    mockInsert = async () => true;
    const r = await handlers.webhookInitUploadHandler(
      {
        ...auth,
        body: {
          file_name: "dump.json",
          file_size: 4,
          content_type: "application/json",
          environment: "prod",
          tag: "t",
        },
      },
      ctx(),
    );
    expect(r.status).toBe(200);
    expect(r.kind).toBe("json");
    if (r.kind === "json") {
      const body = r.body as Record<string, unknown>;
      expect(body.method).toBe("PUT");
      expect(body.headers).toEqual({
        "Content-Type": "application/json",
        "Content-Length": "4",
        "If-None-Match": "*",
      });
      expect(body.max_bytes).toBe(5_000_000_000);
      expect(String(body.file_key)).toContain("/direct/");
      expect(String(body.put_url)).not.toContain("backy.hexly.ai");
    }
  });

  test("400 when generated keys exceed 1024 bytes", async () => {
    const longId = "p".repeat(2000);
    mockGetProjectByToken = async () => ({ ...project, id: longId });
    const r = await handlers.webhookInitUploadHandler(
      {
        ...auth,
        projectId: longId,
        body: { file_name: "a.bin", file_size: 4 },
      },
      ctx(),
    );
    expect(r.status).toBe(400);
  });

  test("500 on unexpected error", async () => {
    mockGetProjectByToken = async () => {
      throw new Error("boom");
    };
    expect(
      (await handlers.webhookInitUploadHandler({ ...auth, body: {} }, ctx())).status,
    ).toBe(500);
  });
});

describe("webhookCompleteUploadHandler", () => {
  beforeEach(() => {
    mockGetProjectByToken = async () => project;
    mockGetUpload = async () => pending();
    mockClaim = async () => true;
    mockRenew = async () => true;
    mockComplete = async () => true;
    mockGetBackupByFileKey = async () => undefined;
    mockCreateBackup = async () => ({
      id: "b1",
      project_id: "p1",
      file_size: 4,
      created_at: "2026-01-01T00:00:00.000Z",
    });
  });

  test("404 missing, 410 aborted/expired/purged/completed-without-backup", async () => {
    mockGetUpload = async () => undefined;
    expect(
      (await handlers.webhookCompleteUploadHandler({ ...auth, uploadId: "u" }, ctx())).status,
    ).toBe(404);
    mockGetUpload = async () => pending({ status: "aborted" });
    expect(
      (await handlers.webhookCompleteUploadHandler({ ...auth, uploadId: "u" }, ctx())).status,
    ).toBe(410);
    mockGetUpload = async () => pending({ status: "expired" });
    expect(
      (await handlers.webhookCompleteUploadHandler({ ...auth, uploadId: "u" }, ctx())).status,
    ).toBe(410);
    mockGetUpload = async () => pending({ purge_after: 0 });
    expect(
      (await handlers.webhookCompleteUploadHandler({ ...auth, uploadId: "u" }, ctx())).status,
    ).toBe(410);
    mockGetUpload = async () =>
      pending({ status: "completed", backup_id: null });
    expect(
      (await handlers.webhookCompleteUploadHandler({ ...auth, uploadId: "u" }, ctx())).status,
    ).toBe(410);
  });

  test("201 idempotent completed backup", async () => {
    mockGetUpload = async () =>
      pending({ status: "completed", backup_id: "b1" });
    mockGetBackup = async () => ({
      id: "b1",
      project_id: "p1",
      file_size: 4,
      created_at: "t",
    });
    const r = await handlers.webhookCompleteUploadHandler(
      { ...auth, uploadId: "u" },
      ctx(),
    );
    expect(r.status).toBe(201);
    if (r.kind === "json") {
      expect(r.body).toEqual({
        id: "b1",
        project_id: "p1",
        file_size: 4,
        created_at: "t",
      });
    }
  });

  test("409 live completing lease, 404 missing object, 409 size mismatch", async () => {
    mockClaim = async () => false;
    mockGetUpload = async () =>
      pending({
        status: "completing",
        lease_expires_at: 9_000_000_000,
      });
    expect(
      (await handlers.webhookCompleteUploadHandler({ ...auth, uploadId: "u" }, ctx())).status,
    ).toBe(409);
    mockClaim = async () => true;
    mockGetUpload = async () => pending();
    const missing = await handlers.webhookCompleteUploadHandler(
      { ...auth, uploadId: "u" },
      ctx({ r2: makeMockR2({ head: async () => null }) }),
    );
    expect(missing.status).toBe(404);
    const mismatch = await handlers.webhookCompleteUploadHandler(
      { ...auth, uploadId: "u" },
      ctx({ r2: makeMockR2({ head: async () => ({ contentLength: 9 }) }) }),
    );
    expect(mismatch.status).toBe(409);
  });

  test("attaches existing backup, copies, and returns 201", async () => {
    mockGetBackupByFileKey = async () => ({
      id: "old",
      project_id: "p1",
      file_size: 4,
      created_at: "t",
    });
    expect(
      (await handlers.webhookCompleteUploadHandler({ ...auth, uploadId: "u" }, ctx())).status,
    ).toBe(201);
    mockGetBackupByFileKey = async () => ({
      id: "x",
      project_id: "other",
      file_size: 4,
      created_at: "t",
    });
    expect(
      (await handlers.webhookCompleteUploadHandler({ ...auth, uploadId: "u" }, ctx())).status,
    ).toBe(409);
    mockGetBackupByFileKey = async () => undefined;
    mockRenew = async () => false;
    expect(
      (await handlers.webhookCompleteUploadHandler({ ...auth, uploadId: "u" }, ctx())).status,
    ).toBe(409);
    let renews = 0;
    mockRenew = async () => {
      renews++;
      return renews !== 2;
    };
    expect(
      (await handlers.webhookCompleteUploadHandler({ ...auth, uploadId: "u" }, ctx())).status,
    ).toBe(409);
    mockRenew = async () => true;
    const ok = await handlers.webhookCompleteUploadHandler(
      { ...auth, uploadId: "u" },
      ctx(),
    );
    expect(ok.status).toBe(201);
  });

  test("createBackup conflict attaches or 409s; finalize 0 rows is 409", async () => {
    mockCreateBackup = async () => {
      throw new Error("UNIQUE constraint failed: backups.file_key");
    };
    let keyLookups = 0;
    mockGetBackupByFileKey = async () => {
      keyLookups++;
      if (keyLookups === 1) return undefined;
      return {
        id: "c1",
        project_id: "p1",
        file_size: 4,
        created_at: "t",
      };
    };
    expect(
      (await handlers.webhookCompleteUploadHandler({ ...auth, uploadId: "u" }, ctx())).status,
    ).toBe(201);
    mockGetBackupByFileKey = async () => undefined;
    expect(
      (await handlers.webhookCompleteUploadHandler({ ...auth, uploadId: "u" }, ctx())).status,
    ).toBe(409);
    mockCreateBackup = async () => ({
      id: "b1",
      project_id: "p1",
      file_size: 4,
      created_at: "t",
    });
    mockComplete = async () => false;
    expect(
      (await handlers.webhookCompleteUploadHandler({ ...auth, uploadId: "u" }, ctx())).status,
    ).toBe(409);
  });

  test("json under preview size sets json_key; 500 on throw", async () => {
    mockGetUpload = async () =>
      pending({
        file_name: "a.json",
        content_type: "application/json",
        declared_size: 4,
      });
    let created: any;
    mockCreateBackup = async (data) => {
      created = data;
      return {
        id: "b1",
        project_id: "p1",
        file_size: 4,
        created_at: "t",
      };
    };
    await handlers.webhookCompleteUploadHandler({ ...auth, uploadId: "u" }, ctx());
    expect(created.isSingleJson).toBe(true);
    expect(created.jsonKey).toBe("backups/p1/direct/u.bin");
    mockGetProjectByToken = async () => {
      throw new Error("x");
    };
    expect(
      (await handlers.webhookCompleteUploadHandler({ ...auth, uploadId: "u" }, ctx())).status,
    ).toBe(500);
  });

  test("claim miss completed backup returns 201", async () => {
    mockClaim = async () => false;
    let reads = 0;
    mockGetUpload = async () => {
      reads++;
      if (reads === 1) return pending();
      return pending({ status: "completed", backup_id: "b1" });
    };
    mockGetBackup = async () => ({
      id: "b1",
      project_id: "p1",
      file_size: 4,
      created_at: "t",
    });
    expect(
      (await handlers.webhookCompleteUploadHandler({ ...auth, uploadId: "u" }, ctx())).status,
    ).toBe(201);
  });

  test("claim miss with missing row is 410", async () => {
    mockClaim = async () => false;
    let reads = 0;
    mockGetUpload = async () => {
      reads++;
      if (reads === 1) return pending();
      return undefined;
    };
    expect(
      (await handlers.webhookCompleteUploadHandler({ ...auth, uploadId: "u" }, ctx())).status,
    ).toBe(410);
  });
});

describe("webhookAbortUploadHandler", () => {
  beforeEach(() => {
    mockGetProjectByToken = async () => project;
    mockGetUpload = async () => pending();
    mockAbortPending = async () => true;
  });

  test("404/200/409 and 500", async () => {
    mockGetUpload = async () => undefined;
    expect(
      (await handlers.webhookAbortUploadHandler({ ...auth, uploadId: "u" }, ctx())).status,
    ).toBe(404);
    mockGetUpload = async () => pending();
    expect(
      (await handlers.webhookAbortUploadHandler({ ...auth, uploadId: "u" }, ctx())).status,
    ).toBe(200);
    mockAbortPending = async () => false;
    mockGetUpload = async () => pending({ status: "aborted" });
    expect(
      (await handlers.webhookAbortUploadHandler({ ...auth, uploadId: "u" }, ctx())).status,
    ).toBe(200);
    mockGetUpload = async () => pending({ status: "completing" });
    expect(
      (await handlers.webhookAbortUploadHandler({ ...auth, uploadId: "u" }, ctx())).status,
    ).toBe(409);
    mockGetProjectByToken = async () => {
      throw new Error("x");
    };
    expect(
      (await handlers.webhookAbortUploadHandler({ ...auth, uploadId: "u" }, ctx())).status,
    ).toBe(500);
  });
});
