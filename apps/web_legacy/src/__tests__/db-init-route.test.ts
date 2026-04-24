import { describe, expect, test, beforeEach, mock } from "bun:test";
import { SCHEMA_STUBS } from "./helpers";

// --- Mutable mock state ---

let mockInitializeSchema: () => Promise<void> = async () => {};

function skipDb<T extends unknown[], R>(fn: (...args: T) => R) {
  return (...args: [unknown, ...T]) => fn(...(args.slice(1) as T));
}

mock.module("@backy/api/db/schema", () => ({
  ...SCHEMA_STUBS,
  initializeSchema: skipDb(() => mockInitializeSchema()),
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
