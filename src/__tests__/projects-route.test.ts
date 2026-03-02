import { describe, expect, test, beforeEach, mock } from "bun:test";
import { PROJECT_STUBS, makeProject } from "./helpers";

// --- Mutable mock state ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockListProjects: () => Promise<any> = async () => [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockCreateProject: (...args: any[]) => Promise<any> = async () => ({});

mock.module("@/lib/db/projects", () => ({
  ...PROJECT_STUBS,
  listProjects: () => mockListProjects(),
  createProject: (...args: unknown[]) => mockCreateProject(...args),
}));

const { GET, POST } = await import("@/app/api/projects/route");

describe("/api/projects", () => {
  beforeEach(() => {
    mockListProjects = async () => [];
    mockCreateProject = async () => ({});
  });

  // -----------------------------------------------------------------------
  // GET /api/projects
  // -----------------------------------------------------------------------

  describe("GET", () => {
    test("returns list of projects", async () => {
      const projects = [makeProject({ id: "p1" }), makeProject({ id: "p2", name: "Project 2" })];
      mockListProjects = async () => projects;

      const res = await GET();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toHaveLength(2);
      expect(body[0].id).toBe("p1");
    });

    test("returns empty array when no projects", async () => {
      mockListProjects = async () => [];

      const res = await GET();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual([]);
    });

    test("returns 500 on error", async () => {
      mockListProjects = async () => {
        throw new Error("db down");
      };

      const res = await GET();
      expect(res.status).toBe(500);
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/projects
  // -----------------------------------------------------------------------

  describe("POST", () => {
    test("creates project with name and description", async () => {
      const created = makeProject({ id: "new-proj" });
      mockCreateProject = async () => created;

      const res = await POST(
        new Request("http://localhost/api/projects", {
          method: "POST",
          body: JSON.stringify({ name: "New Project", description: "A description" }),
          headers: { "Content-Type": "application/json" },
        }),
      );
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.id).toBe("new-proj");
    });

    test("creates project with name only (no description)", async () => {
      mockCreateProject = async () => makeProject();

      const res = await POST(
        new Request("http://localhost/api/projects", {
          method: "POST",
          body: JSON.stringify({ name: "Minimal" }),
          headers: { "Content-Type": "application/json" },
        }),
      );

      expect(res.status).toBe(201);
    });

    test("returns 400 for empty name", async () => {
      const res = await POST(
        new Request("http://localhost/api/projects", {
          method: "POST",
          body: JSON.stringify({ name: "" }),
          headers: { "Content-Type": "application/json" },
        }),
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid input");
      expect(body.details).toBeDefined();
    });

    test("returns 400 for missing name", async () => {
      const res = await POST(
        new Request("http://localhost/api/projects", {
          method: "POST",
          body: JSON.stringify({}),
          headers: { "Content-Type": "application/json" },
        }),
      );

      expect(res.status).toBe(400);
    });

    test("returns 400 for name exceeding 100 chars", async () => {
      const res = await POST(
        new Request("http://localhost/api/projects", {
          method: "POST",
          body: JSON.stringify({ name: "x".repeat(101) }),
          headers: { "Content-Type": "application/json" },
        }),
      );

      expect(res.status).toBe(400);
    });

    test("returns 400 for description exceeding 500 chars", async () => {
      const res = await POST(
        new Request("http://localhost/api/projects", {
          method: "POST",
          body: JSON.stringify({ name: "Valid", description: "x".repeat(501) }),
          headers: { "Content-Type": "application/json" },
        }),
      );

      expect(res.status).toBe(400);
    });

    test("returns 500 on unexpected error", async () => {
      mockCreateProject = async () => {
        throw new Error("db error");
      };

      const res = await POST(
        new Request("http://localhost/api/projects", {
          method: "POST",
          body: JSON.stringify({ name: "Test" }),
          headers: { "Content-Type": "application/json" },
        }),
      );

      expect(res.status).toBe(500);
    });
  });
});
