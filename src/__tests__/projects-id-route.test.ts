import { describe, expect, test, beforeEach, mock } from "bun:test";
import { PROJECT_STUBS, makeProject } from "./helpers";

// --- Mutable mock state ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockGetProject: (...args: any[]) => Promise<any> = async () => undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockUpdateProject: (...args: any[]) => Promise<any> = async () => ({});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockDeleteProject: (...args: any[]) => Promise<any> = async () => false;

mock.module("@/lib/db/projects", () => ({
  ...PROJECT_STUBS,
  getProject: (...args: unknown[]) => mockGetProject(...args),
  updateProject: (...args: unknown[]) => mockUpdateProject(...args),
  deleteProject: (...args: unknown[]) => mockDeleteProject(...args),
}));

const { GET, PUT, DELETE } = await import("@/app/api/projects/[id]/route");

// --- Helpers ---

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("/api/projects/[id]", () => {
  beforeEach(() => {
    mockGetProject = async () => undefined;
    mockUpdateProject = async () => ({});
    mockDeleteProject = async () => false;
  });

  // -----------------------------------------------------------------------
  // GET
  // -----------------------------------------------------------------------

  describe("GET", () => {
    test("returns project when found", async () => {
      const project = makeProject();
      mockGetProject = async () => project;

      const res = await GET(new Request("http://localhost/api/projects/proj-test"), makeParams("proj-test"));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.id).toBe("proj-test");
    });

    test("returns 404 when not found", async () => {
      const res = await GET(new Request("http://localhost/api/projects/missing"), makeParams("missing"));
      expect(res.status).toBe(404);
    });

    test("returns 500 on error", async () => {
      mockGetProject = async () => {
        throw new Error("db error");
      };

      const res = await GET(new Request("http://localhost/api/projects/proj-test"), makeParams("proj-test"));
      expect(res.status).toBe(500);
    });
  });

  // -----------------------------------------------------------------------
  // PUT
  // -----------------------------------------------------------------------

  describe("PUT", () => {
    test("updates project name", async () => {
      const updated = makeProject({ name: "Updated" });
      mockUpdateProject = async () => updated;

      const res = await PUT(
        new Request("http://localhost/api/projects/proj-test", {
          method: "PUT",
          body: JSON.stringify({ name: "Updated" }),
          headers: { "Content-Type": "application/json" },
        }),
        makeParams("proj-test"),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.name).toBe("Updated");
    });

    test("validates and normalizes allowed_ips", async () => {
      mockUpdateProject = async () => makeProject({ allowed_ips: "10.0.0.0/8" });

      const res = await PUT(
        new Request("http://localhost/api/projects/proj-test", {
          method: "PUT",
          body: JSON.stringify({ allowed_ips: "10.0.0.0/8" }),
          headers: { "Content-Type": "application/json" },
        }),
        makeParams("proj-test"),
      );

      expect(res.status).toBe(200);
    });

    test("returns 400 for invalid IPs", async () => {
      const res = await PUT(
        new Request("http://localhost/api/projects/proj-test", {
          method: "PUT",
          body: JSON.stringify({ allowed_ips: "not-an-ip" }),
          headers: { "Content-Type": "application/json" },
        }),
        makeParams("proj-test"),
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid IP");
      expect(body.invalid).toContain("not-an-ip");
    });

    test("clears allowed_ips when set to null", async () => {
      let capturedUpdate: Record<string, unknown> = {};
      mockUpdateProject = async (_id: string, data: Record<string, unknown>) => {
        capturedUpdate = data;
        return makeProject({ allowed_ips: null });
      };

      const res = await PUT(
        new Request("http://localhost/api/projects/proj-test", {
          method: "PUT",
          body: JSON.stringify({ allowed_ips: null }),
          headers: { "Content-Type": "application/json" },
        }),
        makeParams("proj-test"),
      );

      expect(res.status).toBe(200);
      expect(capturedUpdate.allowed_ips).toBeNull();
    });

    test("returns 400 for invalid zod input", async () => {
      const res = await PUT(
        new Request("http://localhost/api/projects/proj-test", {
          method: "PUT",
          body: JSON.stringify({ auto_backup_interval: 99 }),
          headers: { "Content-Type": "application/json" },
        }),
        makeParams("proj-test"),
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid input");
    });

    test("updates auto-backup fields", async () => {
      let capturedUpdate: Record<string, unknown> = {};
      mockUpdateProject = async (_id: string, data: Record<string, unknown>) => {
        capturedUpdate = data;
        return makeProject(data);
      };

      const res = await PUT(
        new Request("http://localhost/api/projects/proj-test", {
          method: "PUT",
          body: JSON.stringify({
            auto_backup_enabled: 1,
            auto_backup_interval: 12,
            auto_backup_webhook: "https://example.com/hook",
          }),
          headers: { "Content-Type": "application/json" },
        }),
        makeParams("proj-test"),
      );

      expect(res.status).toBe(200);
      expect(capturedUpdate.auto_backup_enabled).toBe(1);
      expect(capturedUpdate.auto_backup_interval).toBe(12);
      expect(capturedUpdate.auto_backup_webhook).toBe("https://example.com/hook");
    });

    test("rejects HTTP webhook URL (SSRF protection)", async () => {
      const res = await PUT(
        new Request("http://localhost/api/projects/proj-test", {
          method: "PUT",
          body: JSON.stringify({ auto_backup_webhook: "http://example.com/hook" }),
          headers: { "Content-Type": "application/json" },
        }),
        makeParams("proj-test"),
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("not allowed");
    });

    test("rejects localhost webhook URL (SSRF protection)", async () => {
      const res = await PUT(
        new Request("http://localhost/api/projects/proj-test", {
          method: "PUT",
          body: JSON.stringify({ auto_backup_webhook: "https://localhost/hook" }),
          headers: { "Content-Type": "application/json" },
        }),
        makeParams("proj-test"),
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("not allowed");
    });

    test("rejects cloud metadata webhook URL (SSRF protection)", async () => {
      const res = await PUT(
        new Request("http://localhost/api/projects/proj-test", {
          method: "PUT",
          body: JSON.stringify({ auto_backup_webhook: "https://169.254.169.254/latest/meta-data/" }),
          headers: { "Content-Type": "application/json" },
        }),
        makeParams("proj-test"),
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("not allowed");
    });

    test("allows null webhook URL (clear)", async () => {
      let capturedUpdate: Record<string, unknown> = {};
      mockUpdateProject = async (_id: string, data: Record<string, unknown>) => {
        capturedUpdate = data;
        return makeProject(data);
      };

      const res = await PUT(
        new Request("http://localhost/api/projects/proj-test", {
          method: "PUT",
          body: JSON.stringify({ auto_backup_webhook: null }),
          headers: { "Content-Type": "application/json" },
        }),
        makeParams("proj-test"),
      );

      expect(res.status).toBe(200);
      expect(capturedUpdate.auto_backup_webhook).toBeNull();
    });

    test("returns 404 when project not found", async () => {
      mockUpdateProject = async () => undefined;

      const res = await PUT(
        new Request("http://localhost/api/projects/missing", {
          method: "PUT",
          body: JSON.stringify({ name: "Test" }),
          headers: { "Content-Type": "application/json" },
        }),
        makeParams("missing"),
      );

      expect(res.status).toBe(404);
    });

    test("returns 500 on error", async () => {
      mockUpdateProject = async () => {
        throw new Error("db error");
      };

      const res = await PUT(
        new Request("http://localhost/api/projects/proj-test", {
          method: "PUT",
          body: JSON.stringify({ name: "Test" }),
          headers: { "Content-Type": "application/json" },
        }),
        makeParams("proj-test"),
      );

      expect(res.status).toBe(500);
    });
  });

  // -----------------------------------------------------------------------
  // DELETE
  // -----------------------------------------------------------------------

  describe("DELETE", () => {
    test("deletes project successfully", async () => {
      mockDeleteProject = async () => true;

      const res = await DELETE(new Request("http://localhost/api/projects/proj-test"), makeParams("proj-test"));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
    });

    test("returns 404 when project not found", async () => {
      mockDeleteProject = async () => false;

      const res = await DELETE(new Request("http://localhost/api/projects/missing"), makeParams("missing"));
      expect(res.status).toBe(404);
    });

    test("returns 500 on error", async () => {
      mockDeleteProject = async () => {
        throw new Error("db error");
      };

      const res = await DELETE(new Request("http://localhost/api/projects/proj-test"), makeParams("proj-test"));
      expect(res.status).toBe(500);
    });
  });
});
