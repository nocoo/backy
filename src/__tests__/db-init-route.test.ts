import { describe, expect, test, beforeEach, mock } from "bun:test";
import { SCHEMA_STUBS } from "./helpers";

// --- Mutable mock state ---

let mockInitializeSchema: () => Promise<void> = async () => {};

mock.module("@/lib/db/schema", () => ({
  ...SCHEMA_STUBS,
  initializeSchema: () => mockInitializeSchema(),
}));

const { POST } = await import("@/app/api/db/init/route");

describe("/api/db/init", () => {
  beforeEach(() => {
    mockInitializeSchema = async () => {};
  });

  test("initializes schema successfully", async () => {
    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe("Schema initialized");
  });

  test("returns 500 on schema error", async () => {
    mockInitializeSchema = async () => {
      throw new Error("SQLITE_ERROR");
    };

    const res = await POST();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Schema initialization failed");
  });
});
