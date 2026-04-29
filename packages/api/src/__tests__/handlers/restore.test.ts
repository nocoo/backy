import { describe, expect, test, beforeEach, vi } from "vitest";
import {
  BACKUP_STUBS,
  PROJECT_STUBS,
  makeMockCtx,
  makeMockR2,
} from "../helpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockGetBackup: (id: string) => Promise<any> = async () => undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockGetProject: (id: string) => Promise<any> = async () => undefined;
let mockCreatePresignedDownloadUrl: (key: string, ttl: number) => Promise<string> =
  async () => "https://mock.example.com/signed";

vi.doMock("../../lib/db/backups", () => ({
  ...BACKUP_STUBS,
  getBackup: (_db: unknown, id: string) => mockGetBackup(id),
}));

vi.doMock("../../lib/db/projects", () => ({
  ...PROJECT_STUBS,
  getProject: (_db: unknown, id: string) => mockGetProject(id),
}));

const { restoreHandler } = await import("../../handlers/restore");

const ctx = makeMockCtx({
  r2: makeMockR2({
    presignDownload: async (key, ttl) => mockCreatePresignedDownloadUrl(key, ttl),
  }),
});

describe("restore handler", () => {
  beforeEach(() => {
    mockGetBackup = async () => undefined;
    mockGetProject = async () => undefined;
    mockCreatePresignedDownloadUrl = async () =>
      "https://mock.example.com/signed";
  });

  test("401 when no auth", async () => {
    const r = await restoreHandler({
      id: "b1",
      authorization: null,
      queryToken: null,
      clientIp: null,
    }, ctx);
    expect(r.status).toBe(401);
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      expect(r.body).toEqual({
        error:
          "Missing authentication. Provide Authorization: Bearer header or ?token= query param.",
      });
  });

  test("401 when authorization not Bearer", async () => {
    const r = await restoreHandler({
      id: "b1",
      authorization: "Basic xyz",
      queryToken: null,
      clientIp: null,
    }, ctx);
    expect(r.status).toBe(401);
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      // Same error: Basic auth without ?token= falls through to the
      // missing-auth branch (Bearer is the only accepted scheme).
      expect(r.body).toEqual({
        error:
          "Missing authentication. Provide Authorization: Bearer header or ?token= query param.",
      });
  });

  test("404 when backup missing", async () => {
    const r = await restoreHandler({
      id: "b1",
      authorization: "Bearer t",
      queryToken: null,
      clientIp: null,
    }, ctx);
    expect(r.status).toBe(404);
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      expect(r.body).toEqual({ error: "Backup not found" });
  });

  test("403 when project missing", async () => {
    mockGetBackup = async () => ({
      id: "b1",
      project_id: "p1",
      file_key: "k",
      file_size: 100,
    });
    const r = await restoreHandler({
      id: "b1",
      authorization: "Bearer t",
      queryToken: null,
      clientIp: null,
    }, ctx);
    expect(r.status).toBe(403);
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      // Project-not-found also returns 'Invalid token' (not a more
      // specific 'Project not found') — the impl deliberately doesn't
      // leak the existence of the project to an unauthenticated caller.
      expect(r.body).toEqual({ error: "Invalid token" });
  });

  test("403 when token mismatches", async () => {
    mockGetBackup = async () => ({
      id: "b1",
      project_id: "p1",
      file_key: "k",
      file_size: 100,
    });
    mockGetProject = async () => ({
      id: "p1",
      webhook_token: "right",
      allowed_ips: null,
    });
    const r = await restoreHandler({
      id: "b1",
      authorization: "Bearer wrong",
      queryToken: null,
      clientIp: null,
    }, ctx);
    expect(r.status).toBe(403);
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      expect(r.body).toEqual({ error: "Invalid token" });
  });

  test("403 when client IP not allowed", async () => {
    mockGetBackup = async () => ({
      id: "b1",
      project_id: "p1",
      file_key: "k",
      file_size: 100,
    });
    mockGetProject = async () => ({
      id: "p1",
      webhook_token: "t",
      allowed_ips: "10.0.0.0/8",
    });
    const r = await restoreHandler({
      id: "b1",
      authorization: "Bearer t",
      queryToken: null,
      clientIp: "1.2.3.4",
    }, ctx);
    expect(r.status).toBe(403);
    expect(r.kind).toBe("json");
    if (r.kind === "json")
      // CIDR mismatch returns the generic 'Forbidden' — don't leak the
      // allowed CIDR ranges to a denied caller.
      expect(r.body).toEqual({ error: "Forbidden" });
  });

  test("403 when allowed_ips set but clientIp null", async () => {
    mockGetBackup = async () => ({
      id: "b1",
      project_id: "p1",
      file_key: "k",
      file_size: 100,
    });
    mockGetProject = async () => ({
      id: "p1",
      webhook_token: "t",
      allowed_ips: "10.0.0.0/8",
    });
    const r = await restoreHandler({
      id: "b1",
      authorization: "Bearer t",
      queryToken: null,
      clientIp: null,
    }, ctx);
    expect(r.status).toBe(403);
  });

  test("200 with presigned URL when token valid + no IP restriction", async () => {
    mockGetBackup = async () => ({
      id: "b1",
      project_id: "p1",
      file_key: "k1",
      file_size: 1234,
    });
    mockGetProject = async () => ({
      id: "p1",
      webhook_token: "t",
      allowed_ips: null,
    });
    let calledArgs: [string, number] | undefined;
    mockCreatePresignedDownloadUrl = async (key, ttl) => {
      calledArgs = [key, ttl];
      return "https://signed.example.com/k1";
    };
    const r = await restoreHandler({
      id: "b1",
      authorization: "Bearer t",
      queryToken: null,
      clientIp: null,
    }, ctx);
    expect(r.status).toBe(200);
    // Tightened: positively verify both forwarded args (key + 900s ttl)
    // instead of just the key. Catches a regression that hard-codes a
    // different TTL into the restore handler.
    expect(calledArgs).toEqual(["k1", 900]);
    expect(r.kind).toBe("json");
    if (r.kind === "json") {
      const body = r.body as Record<string, unknown>;
      expect(body.url).toBe("https://signed.example.com/k1");
      expect(body.backup_id).toBe("b1");
      expect(body.project_id).toBe("p1");
      expect(body.file_size).toBe(1234);
      expect(body.expires_in).toBe(900);
    }
  });

  test("200 when client IP matches allowed CIDR", async () => {
    mockGetBackup = async () => ({
      id: "b1",
      project_id: "p1",
      file_key: "k",
      file_size: 1,
    });
    mockGetProject = async () => ({
      id: "p1",
      webhook_token: "t",
      allowed_ips: "10.0.0.0/8",
    });
    const r = await restoreHandler({
      id: "b1",
      authorization: "Bearer t",
      queryToken: null,
      clientIp: "10.1.2.3",
    }, ctx);
    expect(r.status).toBe(200);
  });

  test("500 when getBackup throws", async () => {
    mockGetBackup = async () => {
      throw new Error("db");
    };
    const r = await restoreHandler({
      id: "b1",
      authorization: "Bearer t",
      queryToken: null,
      clientIp: null,
    }, ctx);
    expect(r.status).toBe(500);
  });

  test("200 with query-param token (no Authorization header)", async () => {
    mockGetBackup = async () => ({
      id: "b1",
      project_id: "p1",
      file_key: "k1",
      file_size: 1234,
    });
    mockGetProject = async () => ({
      id: "p1",
      webhook_token: "t",
      allowed_ips: null,
    });
    let calledArgs: [string, number] | undefined;
    mockCreatePresignedDownloadUrl = async (key, ttl) => {
      calledArgs = [key, ttl];
      return "https://signed.example.com/k1";
    };
    const r = await restoreHandler({
      id: "b1",
      authorization: null,
      queryToken: "t",
      clientIp: null,
    }, ctx);
    expect(r.status).toBe(200);
    // Tightened: query-param auth must take the same code path as
    // Bearer (presign called with file_key + 900s TTL); status-only
    // would mask a regression that authenticates correctly but skips
    // the presign step.
    expect(calledArgs).toEqual(["k1", 900]);
  });

  test("403 when query-param token mismatches", async () => {
    mockGetBackup = async () => ({
      id: "b1",
      project_id: "p1",
      file_key: "k1",
      file_size: 1234,
    });
    mockGetProject = async () => ({
      id: "p1",
      webhook_token: "right",
      allowed_ips: null,
    });
    const r = await restoreHandler({
      id: "b1",
      authorization: null,
      queryToken: "wrong",
      clientIp: null,
    }, ctx);
    expect(r.status).toBe(403);
  });

  test("Bearer wins over query-param when both provided", async () => {
    mockGetBackup = async () => ({
      id: "b1",
      project_id: "p1",
      file_key: "k1",
      file_size: 1234,
    });
    mockGetProject = async () => ({
      id: "p1",
      webhook_token: "bearer-token",
      allowed_ips: null,
    });
    let presignCalls = 0;
    mockCreatePresignedDownloadUrl = async () => {
      presignCalls++;
      return "https://signed.example.com/k1";
    };
    const r = await restoreHandler({
      id: "b1",
      authorization: "Bearer bearer-token",
      queryToken: "wrong-query",
      clientIp: null,
    }, ctx);
    expect(r.status).toBe(200);
    // Tightened: precedence rule must be Bearer-first, NOT query-token-
    // first (with bearer-token matching, wrong-query irrelevant). Status
    // 200 alone could pass even if the impl flipped the precedence and
    // happened to match by coincidence on a future fixture change.
    expect(presignCalls).toBe(1);
  });
});
