import { describe, expect, test, beforeEach, mock } from "bun:test";
import { PROJECT_STUBS, BACKUP_STUBS, makeProject, makeBackup } from "./helpers";

// --- Mutable mock state ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockGetBackup: (...args: any[]) => Promise<any> = async () => undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockGetProject: (...args: any[]) => Promise<any> = async () => undefined;

mock.module("@/lib/db/backups", () => ({
  ...BACKUP_STUBS,
  getBackup: (...args: unknown[]) => mockGetBackup(...args),
}));

mock.module("@/lib/db/projects", () => ({
  ...PROJECT_STUBS,
  getProject: (...args: unknown[]) => mockGetProject(...args),
}));

const { GET } = await import("@/app/api/backups/[id]/restore-command/route");

// --- Helpers ---

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function callGET(id: string) {
  return GET(
    new Request(`http://localhost:7026/api/backups/${id}/restore-command`),
    makeParams(id),
  );
}

describe("/api/backups/[id]/restore-command", () => {
  beforeEach(() => {
    mockGetBackup = async () => undefined;
    mockGetProject = async () => undefined;
  });

  test("returns restore command with token embedded", async () => {
    const backup = makeBackup({ id: "bk-1", project_id: "proj-1" });
    const project = makeProject({ id: "proj-1", webhook_token: "tok-secret" });
    mockGetBackup = async () => backup;
    mockGetProject = async () => project;

    const res = await callGET("bk-1");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.command).toContain("curl");
    expect(body.command).toContain("/api/restore/bk-1");
    expect(body.command).toContain("Bearer tok-secret");
  });

  test("returns 404 when backup not found", async () => {
    const res = await callGET("missing");
    expect(res.status).toBe(404);
  });

  test("returns 404 when project not found", async () => {
    const backup = makeBackup({ project_id: "missing-proj" });
    mockGetBackup = async () => backup;

    const res = await callGET("bk-1");
    expect(res.status).toBe(404);
  });

  test("returns 500 on error", async () => {
    mockGetBackup = async () => {
      throw new Error("db error");
    };

    const res = await callGET("bk-1");
    expect(res.status).toBe(500);
  });
});
