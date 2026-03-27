import { describe, expect, test, beforeEach, mock } from "bun:test";
import { PROJECT_STUBS, makeProject } from "./helpers";

// Ensure backy.hexly.ai is in ALLOWED_HOSTS for x-forwarded-host tests
process.env.ALLOWED_HOSTS = "backy.hexly.ai,localhost:7026";

// --- Mutable mock state ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockGetProject: (...args: any[]) => Promise<any> = async () => undefined;

mock.module("@/lib/db/projects", () => ({
  ...PROJECT_STUBS,
  getProject: (...args: unknown[]) => mockGetProject(...args),
}));

const { GET } = await import("@/app/api/projects/[id]/prompt/route");

// --- Helpers ---

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("/api/projects/[id]/prompt", () => {
  beforeEach(() => {
    mockGetProject = async () => undefined;
  });

  test("returns prompt text for existing project", async () => {
    const project = makeProject({ id: "proj-abc", name: "My SaaS" });
    mockGetProject = async () => project;

    const res = await GET(
      new Request("http://localhost:7026/api/projects/proj-abc/prompt"),
      makeParams("proj-abc"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.prompt).toBeDefined();
    expect(body.prompt).toContain("My SaaS");
    expect(body.prompt).toContain("tok-abc"); // the webhook_token
    expect(body.prompt).toContain("/api/webhook/proj-abc");
  });

  test("includes auto-backup section when enabled", async () => {
    const project = makeProject({
      auto_backup_enabled: 1,
      auto_backup_interval: 12,
      auto_backup_webhook: "https://example.com/backup",
    });
    mockGetProject = async () => project;

    const res = await GET(
      new Request("http://localhost:7026/api/projects/proj-test/prompt"),
      makeParams("proj-test"),
    );
    const body = await res.json();

    expect(body.prompt).toContain("Scheduled Pull");
    expect(body.prompt).toContain("Every 12 hours");
    expect(body.prompt).toContain("https://example.com/backup");
  });

  test("shows not enabled when auto backup is off", async () => {
    const project = makeProject({ auto_backup_enabled: 0 });
    mockGetProject = async () => project;

    const res = await GET(
      new Request("http://localhost:7026/api/projects/proj-test/prompt"),
      makeParams("proj-test"),
    );
    const body = await res.json();

    expect(body.prompt).toContain("not yet enabled");
  });

  test("uses x-forwarded-host for base URL when in ALLOWED_HOSTS", async () => {
    const project = makeProject();
    mockGetProject = async () => project;

    const res = await GET(
      new Request("http://localhost:7026/api/projects/proj-test/prompt", {
        headers: {
          "x-forwarded-host": "backy.hexly.ai",
          "x-forwarded-proto": "https",
        },
      }),
      makeParams("proj-test"),
    );
    const body = await res.json();

    expect(body.prompt).toContain("https://backy.hexly.ai");
  });

  test("ignores x-forwarded-host not in ALLOWED_HOSTS (host injection defense)", async () => {
    const project = makeProject();
    mockGetProject = async () => project;

    const res = await GET(
      new Request("http://localhost:7026/api/projects/proj-test/prompt", {
        headers: {
          "x-forwarded-host": "evil.com",
          "x-forwarded-proto": "https",
        },
      }),
      makeParams("proj-test"),
    );
    const body = await res.json();

    // Should fall back to request origin, NOT use evil.com
    expect(body.prompt).not.toContain("evil.com");
    expect(body.prompt).toContain("localhost:7026");
  });

  test("returns 404 when project not found", async () => {
    const res = await GET(
      new Request("http://localhost:7026/api/projects/missing/prompt"),
      makeParams("missing"),
    );
    expect(res.status).toBe(404);
  });

  test("returns 500 on error", async () => {
    mockGetProject = async () => {
      throw new Error("db error");
    };

    const res = await GET(
      new Request("http://localhost:7026/api/projects/proj-test/prompt"),
      makeParams("proj-test"),
    );
    expect(res.status).toBe(500);
  });
});
