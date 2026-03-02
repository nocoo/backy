import { describe, expect, test, beforeEach, mock } from "bun:test";
import { BACKUP_STUBS, PROJECT_STUBS, R2_STUBS, makeBackup, makeProject } from "./helpers";
import { NextRequest } from "next/server";

// --- Mutable mock state ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockListBackups: (...args: any[]) => Promise<any> = async () => ({
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  totalPages: 0,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockListEnvironments: () => Promise<any> = async () => [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockDeleteBackups: (...args: any[]) => Promise<any> = async () => [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockListProjects: () => Promise<any> = async () => [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockDeleteFromR2: (...args: any[]) => Promise<void> = async () => {};

mock.module("@/lib/db/backups", () => ({
  ...BACKUP_STUBS,
  listBackups: (...args: unknown[]) => mockListBackups(...args),
  listEnvironments: () => mockListEnvironments(),
  deleteBackups: (...args: unknown[]) => mockDeleteBackups(...args),
}));

mock.module("@/lib/db/projects", () => ({
  ...PROJECT_STUBS,
  listProjects: () => mockListProjects(),
}));

mock.module("@/lib/r2/client", () => ({
  ...R2_STUBS,
  deleteFromR2: (...args: unknown[]) => mockDeleteFromR2(...args),
}));

const { GET, DELETE } = await import("@/app/api/backups/route");

// --- Helpers ---

function makeRequest(path: string, init?: RequestInit) {
  // NextRequest constructor types are stricter than standard RequestInit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new NextRequest(new URL(path, "http://localhost:7026"), init as any);
}

describe("/api/backups", () => {
  beforeEach(() => {
    mockListBackups = async () => ({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    });
    mockListEnvironments = async () => [];
    mockDeleteBackups = async () => [];
    mockListProjects = async () => [];
    mockDeleteFromR2 = async () => {};
  });

  // -----------------------------------------------------------------------
  // GET /api/backups
  // -----------------------------------------------------------------------

  describe("GET", () => {
    test("returns paginated backups with environments and projects", async () => {
      const backup = makeBackup();
      const project = makeProject();
      mockListBackups = async () => ({
        items: [backup],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });
      mockListEnvironments = async () => ["prod", "staging"];
      mockListProjects = async () => [project];

      const res = await GET(makeRequest("/api/backups"));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.items).toHaveLength(1);
      expect(body.total).toBe(1);
      expect(body.environments).toEqual(["prod", "staging"]);
      expect(body.projects).toEqual([{ id: project.id, name: project.name }]);
    });

    test("passes query params to listBackups", async () => {
      let captured: Record<string, unknown> = {};
      mockListBackups = async (opts: unknown) => {
        captured = opts as Record<string, unknown>;
        return { items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };
      };

      await GET(
        makeRequest(
          "/api/backups?projectId=p1&search=hello&environment=prod&sortBy=file_size&sortOrder=asc&page=2&pageSize=10",
        ),
      );

      expect(captured.projectId).toBe("p1");
      expect(captured.search).toBe("hello");
      expect(captured.environment).toBe("prod");
      expect(captured.sortBy).toBe("file_size");
      expect(captured.sortOrder).toBe("asc");
      expect(captured.page).toBe(2);
      expect(captured.pageSize).toBe(10);
    });

    test("defaults sortBy=created_at, sortOrder=desc when invalid", async () => {
      let captured: Record<string, unknown> = {};
      mockListBackups = async (opts: unknown) => {
        captured = opts as Record<string, unknown>;
        return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
      };

      await GET(makeRequest("/api/backups?sortBy=invalid&sortOrder=invalid"));

      expect(captured.sortBy).toBe("created_at");
      expect(captured.sortOrder).toBe("desc");
    });

    test("clamps page to minimum 1 and pageSize to 1..100", async () => {
      let captured: Record<string, unknown> = {};
      mockListBackups = async (opts: unknown) => {
        captured = opts as Record<string, unknown>;
        return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
      };

      await GET(makeRequest("/api/backups?page=-5&pageSize=999"));

      expect(captured.page).toBe(1);
      expect(captured.pageSize).toBe(100);
    });

    test("returns 500 on error", async () => {
      mockListBackups = async () => {
        throw new Error("db down");
      };

      const res = await GET(makeRequest("/api/backups"));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Failed to list backups");
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /api/backups (batch)
  // -----------------------------------------------------------------------

  describe("DELETE", () => {
    test("deletes backups and cleans up R2 files", async () => {
      const deletedKeys = [
        { fileKey: "backups/a.zip", jsonKey: "backups/a.json" },
        { fileKey: "backups/b.zip", jsonKey: null },
      ];
      mockDeleteBackups = async () => deletedKeys;
      const r2Deleted: string[] = [];
      mockDeleteFromR2 = async (key: string) => {
        r2Deleted.push(key);
      };

      const res = await DELETE(
        makeRequest("/api/backups", {
          method: "DELETE",
          body: JSON.stringify({ ids: ["id1", "id2"] }),
        }),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.deleted).toBe(2);
      expect(r2Deleted).toContain("backups/a.zip");
      expect(r2Deleted).toContain("backups/a.json");
      expect(r2Deleted).toContain("backups/b.zip");
    });

    test("returns 400 if ids is missing", async () => {
      const res = await DELETE(
        makeRequest("/api/backups", {
          method: "DELETE",
          body: JSON.stringify({}),
        }),
      );
      expect(res.status).toBe(400);
    });

    test("returns 400 if ids is empty array", async () => {
      const res = await DELETE(
        makeRequest("/api/backups", {
          method: "DELETE",
          body: JSON.stringify({ ids: [] }),
        }),
      );
      expect(res.status).toBe(400);
    });

    test("returns 400 if ids contains non-strings", async () => {
      const res = await DELETE(
        makeRequest("/api/backups", {
          method: "DELETE",
          body: JSON.stringify({ ids: [1, 2] }),
        }),
      );
      expect(res.status).toBe(400);
    });

    test("returns 400 if ids exceeds 50", async () => {
      const ids = Array.from({ length: 51 }, (_, i) => `id-${i}`);
      const res = await DELETE(
        makeRequest("/api/backups", {
          method: "DELETE",
          body: JSON.stringify({ ids }),
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Maximum 50");
    });

    test("continues cleanup even if R2 delete fails", async () => {
      mockDeleteBackups = async () => [
        { fileKey: "a.zip", jsonKey: null },
        { fileKey: "b.zip", jsonKey: null },
      ];
      let callCount = 0;
      mockDeleteFromR2 = async () => {
        callCount++;
        if (callCount === 1) throw new Error("R2 error");
      };

      const res = await DELETE(
        makeRequest("/api/backups", {
          method: "DELETE",
          body: JSON.stringify({ ids: ["id1", "id2"] }),
        }),
      );
      expect(res.status).toBe(200);
      expect(callCount).toBe(2);
    });

    test("returns 500 on unexpected error", async () => {
      mockDeleteBackups = async () => {
        throw new Error("db failure");
      };

      const res = await DELETE(
        makeRequest("/api/backups", {
          method: "DELETE",
          body: JSON.stringify({ ids: ["id1"] }),
        }),
      );
      expect(res.status).toBe(500);
    });
  });
});
