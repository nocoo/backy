import { describe, expect, test, beforeEach, mock } from "bun:test";
import { PROJECT_STUBS } from "./helpers";

// --- Mutable mock state ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockRegenerateToken: (...args: any[]) => Promise<any> = async () => undefined;

mock.module("@/lib/db/projects", () => ({
  ...PROJECT_STUBS,
  regenerateToken: (...args: unknown[]) => mockRegenerateToken(...args),
}));

const { POST } = await import("@/app/api/projects/[id]/token/route");

// --- Helpers ---

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("/api/projects/[id]/token", () => {
  beforeEach(() => {
    mockRegenerateToken = async () => undefined;
  });

  test("returns new webhook token", async () => {
    mockRegenerateToken = async () => "new-tok-xyz";

    const res = await POST(new Request("http://localhost/api/projects/proj-test/token"), makeParams("proj-test"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.webhook_token).toBe("new-tok-xyz");
  });

  test("returns 404 when project not found", async () => {
    mockRegenerateToken = async () => undefined;

    const res = await POST(new Request("http://localhost/api/projects/missing/token"), makeParams("missing"));
    expect(res.status).toBe(404);
  });

  test("returns 500 on error", async () => {
    mockRegenerateToken = async () => {
      throw new Error("db error");
    };

    const res = await POST(new Request("http://localhost/api/projects/proj-test/token"), makeParams("proj-test"));
    expect(res.status).toBe(500);
  });
});
