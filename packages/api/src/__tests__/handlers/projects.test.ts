import { describe, expect, test, beforeEach, vi } from "vitest";
import { PROJECT_STUBS, makeMockCtx, makeProject } from "../helpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockListProjects: () => Promise<any> = async () => [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockCreateProject: (...args: any[]) => Promise<any> = async () => ({});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockGetProject: (id: string) => Promise<any> = async () => undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockUpdateProject: (...args: any[]) => Promise<any> = async () => undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockDeleteProject: (id: string) => Promise<any> = async () => false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockRegenerateToken: (id: string) => Promise<any> = async () => undefined;

function skipDb<T extends unknown[], R>(fn: (...args: T) => R) {
  return (...args: [unknown, ...T]) => fn(...(args.slice(1) as T));
}

vi.doMock("../../lib/db/projects", () => ({
  ...PROJECT_STUBS,
  listProjects: skipDb(() => mockListProjects()),
  createProject: skipDb((...args: unknown[]) => mockCreateProject(...args)),
  getProject: skipDb((id: string) => mockGetProject(id)),
  updateProject: skipDb((...args: unknown[]) => mockUpdateProject(...args)),
  deleteProject: skipDb((id: string) => mockDeleteProject(id)),
  regenerateToken: skipDb((id: string) => mockRegenerateToken(id)),
}));

const {
  listProjectsHandler,
  createProjectHandler,
  getProjectHandler,
  updateProjectHandler,
  deleteProjectHandler,
  regenerateTokenHandler,
  projectPromptHandler,
} = await import("../../handlers/projects");

const ctx = makeMockCtx();

describe("projects handlers", () => {
  beforeEach(() => {
    mockListProjects = async () => [];
    mockCreateProject = async () => ({});
    mockGetProject = async () => undefined;
    mockUpdateProject = async () => undefined;
    mockDeleteProject = async () => false;
    mockRegenerateToken = async () => undefined;
  });

  describe("listProjectsHandler", () => {
    test("returns 200 with sanitized list", async () => {
      const project = makeProject({
        webhook_token: "secret",
        auto_backup_header_key: "X-K",
        auto_backup_header_value: "v",
      });
      mockListProjects = async () => [project];
      const r = await listProjectsHandler(ctx);
      expect(r.status).toBe(200);
      expect(r.kind).toBe("json");
      // Tightened: pin the entire sanitized payload by its full literal
      // shape (was just one missing-field check). Catches new sensitive
      // fields being leaked AND missing pass-through fields. Inlined on
      // purpose: importing sanitizeProject() to compute the expected
      // would be tautological (the handler already calls it).
      expect((r as { body: unknown }).body).toEqual([
        {
          id: "proj-test",
          name: "Test Project",
          description: null,
          allowed_ips: null,
          category_id: null,
          auto_backup_enabled: 1,
          auto_backup_interval: 1,
          auto_backup_webhook: "https://saas.example.com/trigger-backup",
          auto_backup_headers_configured: true,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ]);
    });

    test("returns 500 on db error", async () => {
      mockListProjects = async () => {
        throw new Error("db");
      };
      expect((await listProjectsHandler(ctx)).status).toBe(500);
    });
  });

  describe("createProjectHandler", () => {
    test("returns 201 on valid input", async () => {
      mockCreateProject = async () => makeProject();
      const r = await createProjectHandler({ body: { name: "ok" } }, ctx);
      expect(r.status).toBe(201);
    });

    test("returns 400 on invalid input", async () => {
      const r = await createProjectHandler({ body: { name: "" } }, ctx);
      expect(r.status).toBe(400);
    });

    test("returns 500 on db error", async () => {
      mockCreateProject = async () => {
        throw new Error("db");
      };
      const r = await createProjectHandler({ body: { name: "ok" } }, ctx);
      expect(r.status).toBe(500);
    });
  });

  describe("getProjectHandler", () => {
    test("returns 200 when found", async () => {
      mockGetProject = async () => makeProject();
      const r = await getProjectHandler({ id: "p1" }, ctx);
      expect(r.status).toBe(200);
    });

    test("returns 404 when not found", async () => {
      const r = await getProjectHandler({ id: "p1" }, ctx);
      expect(r.status).toBe(404);
    });

    test("returns 500 on db error", async () => {
      mockGetProject = async () => {
        throw new Error("db");
      };
      expect((await getProjectHandler({ id: "p1" }, ctx)).status).toBe(500);
    });
  });

  describe("updateProjectHandler", () => {
    test("returns 200 on valid update", async () => {
      mockUpdateProject = async () => makeProject();
      const r = await updateProjectHandler({
        id: "p1",
        body: { name: "Renamed", description: "d" },
      }, ctx);
      expect(r.status).toBe(200);
    });

    test("clears allowed_ips when null or empty string", async () => {
      mockUpdateProject = async () => makeProject();
      const r1 = await updateProjectHandler({
        id: "p1",
        body: { allowed_ips: null },
      }, ctx);
      expect(r1.status).toBe(200);
      const r2 = await updateProjectHandler({
        id: "p1",
        body: { allowed_ips: "  " },
      }, ctx);
      expect(r2.status).toBe(200);
    });

    test("validates allowed_ips and returns 400 on bad CIDR", async () => {
      const r = await updateProjectHandler({
        id: "p1",
        body: { allowed_ips: "not-an-ip" },
      }, ctx);
      expect(r.status).toBe(400);
    });

    test("normalizes valid allowed_ips", async () => {
      mockUpdateProject = async () => makeProject();
      const r = await updateProjectHandler({
        id: "p1",
        body: { allowed_ips: "10.0.0.0/8" },
      }, ctx);
      expect(r.status).toBe(200);
    });

    test("returns 400 for unsafe webhook URL", async () => {
      const r = await updateProjectHandler({
        id: "p1",
        body: { auto_backup_webhook: "http://10.0.0.1/x" },
      }, ctx);
      expect(r.status).toBe(400);
    });

    test("accepts null webhook URL", async () => {
      mockUpdateProject = async () => makeProject();
      const r = await updateProjectHandler({
        id: "p1",
        body: { auto_backup_webhook: null },
      }, ctx);
      expect(r.status).toBe(200);
    });

    test("forwards auto_backup_* fields", async () => {
      mockUpdateProject = async () => makeProject();
      const r = await updateProjectHandler({
        id: "p1",
        body: {
          auto_backup_enabled: 1,
          auto_backup_interval: 12,
          auto_backup_header_key: "X-K",
          auto_backup_header_value: "V",
          category_id: "cat1",
        },
      }, ctx);
      expect(r.status).toBe(200);
    });

    test("returns 400 on schema violation", async () => {
      const r = await updateProjectHandler({
        id: "p1",
        body: { auto_backup_interval: 5 },
      }, ctx);
      expect(r.status).toBe(400);
    });

    test("returns 404 when project missing", async () => {
      const r = await updateProjectHandler({
        id: "p1",
        body: { name: "x" },
      }, ctx);
      expect(r.status).toBe(404);
    });

    test("returns 500 on db error", async () => {
      mockUpdateProject = async () => {
        throw new Error("db");
      };
      const r = await updateProjectHandler({
        id: "p1",
        body: { name: "x" },
      }, ctx);
      expect(r.status).toBe(500);
    });
  });

  describe("deleteProjectHandler", () => {
    test("returns 200 when deleted", async () => {
      mockDeleteProject = async () => true;
      expect((await deleteProjectHandler({ id: "p1" }, ctx)).status).toBe(200);
    });

    test("returns 404 when not found", async () => {
      expect((await deleteProjectHandler({ id: "p1" }, ctx)).status).toBe(404);
    });

    test("returns 500 on db error", async () => {
      mockDeleteProject = async () => {
        throw new Error("db");
      };
      expect((await deleteProjectHandler({ id: "p1" }, ctx)).status).toBe(500);
    });
  });

  describe("regenerateTokenHandler", () => {
    test("returns 200 with token", async () => {
      mockRegenerateToken = async () => "new-token";
      const r = await regenerateTokenHandler({ id: "p1" }, ctx);
      expect(r.status).toBe(200);
      expect((r as { body: { webhook_token: string } }).body.webhook_token).toBe(
        "new-token",
      );
    });

    test("returns 404 when project missing", async () => {
      expect((await regenerateTokenHandler({ id: "p1" }, ctx)).status).toBe(404);
    });

    test("returns 500 on db error", async () => {
      mockRegenerateToken = async () => {
        throw new Error("db");
      };
      expect((await regenerateTokenHandler({ id: "p1" }, ctx)).status).toBe(500);
    });
  });

  describe("projectPromptHandler", () => {
    test("returns 200 with prompt markdown", async () => {
      mockGetProject = async () => makeProject();
      const r = await projectPromptHandler({
        id: "p1",
        baseUrl: "https://x.example.com",
      }, ctx);
      expect(r.status).toBe(200);
      const prompt = (r as { body: { prompt: string } }).body.prompt;
      expect(prompt).toContain("https://x.example.com/api/webhook/proj-test");
    });

    test("includes auto-backup section when enabled", async () => {
      mockGetProject = async () =>
        makeProject({
          auto_backup_enabled: 1,
          auto_backup_interval: 1,
          auto_backup_header_key: "X-K",
          auto_backup_header_value: "v",
        });
      const r = await projectPromptHandler({
        id: "p1",
        baseUrl: "https://x.example.com",
      }, ctx);
      const prompt = (r as { body: { prompt: string } }).body.prompt;
      // Tightened: pin the exact "(Active)" badge that appears in the Pull
      // table row when auto-backup is enabled, plus the auth-header line
      // that prints the supplied header key with masked value.
      expect(prompt).toContain("**(Active)**");
      expect(prompt).toContain("**Auth header**: `X-K: \u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022`");
    });

    test("notes auto-backup not enabled when disabled", async () => {
      mockGetProject = async () => makeProject({ auto_backup_enabled: 0 });
      const r = await projectPromptHandler({
        id: "p1",
        baseUrl: "https://x.example.com",
      }, ctx);
      const prompt = (r as { body: { prompt: string } }).body.prompt;
      // Tightened: pin the exact 'not yet enabled' phrase + project name
      // interpolation rather than a bare substring that could match
      // anywhere in the markdown.
      expect(prompt).toContain('is **not yet enabled** for "Test Project"');
    });

    test("returns 404 when project missing", async () => {
      const r = await projectPromptHandler({
        id: "p1",
        baseUrl: "https://x",
      }, ctx);
      expect(r.status).toBe(404);
    });

    test("returns 500 on db error", async () => {
      mockGetProject = async () => {
        throw new Error("db");
      };
      const r = await projectPromptHandler({
        id: "p1",
        baseUrl: "https://x",
      }, ctx);
      expect(r.status).toBe(500);
    });
  });
});
