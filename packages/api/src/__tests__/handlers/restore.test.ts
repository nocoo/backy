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
let mockCreatePresignedDownloadUrl: (key: string) => Promise<string> =
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
    presignDownload: async (key) => mockCreatePresignedDownloadUrl(key),
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
  });

  test("401 when authorization not Bearer", async () => {
    const r = await restoreHandler({
      id: "b1",
      authorization: "Basic xyz",
      queryToken: null,
      clientIp: null,
    }, ctx);
    expect(r.status).toBe(401);
  });

  test("404 when backup missing", async () => {
    const r = await restoreHandler({
      id: "b1",
      authorization: "Bearer t",
      queryToken: null,
      clientIp: null,
    }, ctx);
    expect(r.status).toBe(404);
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
    let calledKey: string | undefined;
    mockCreatePresignedDownloadUrl = async (key) => {
      calledKey = key;
      return "https://signed.example.com/k1";
    };
    const r = await restoreHandler({
      id: "b1",
      authorization: "Bearer t",
      queryToken: null,
      clientIp: null,
    }, ctx);
    expect(r.status).toBe(200);
    expect(calledKey).toBe("k1");
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
    const r = await restoreHandler({
      id: "b1",
      authorization: null,
      queryToken: "t",
      clientIp: null,
    }, ctx);
    expect(r.status).toBe(200);
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
    const r = await restoreHandler({
      id: "b1",
      authorization: "Bearer bearer-token",
      queryToken: "wrong-query",
      clientIp: null,
    }, ctx);
    expect(r.status).toBe(200);
  });
});
