import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test";

// Mock the ID library to avoid nanoid dependency
mock.module("@/lib/id", () => ({
  generateId: () => "mock-id",
}));

import { getBackupFileKeys } from "@/lib/db/backups";

// Redefine what we need from helpers to avoid jszip dependency
export function mockFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): typeof globalThis.fetch {
  const fn = handler as typeof globalThis.fetch;
  fn.preconnect = () => {};
  return fn;
}

export function d1Success<T>(results: T[] = []) {
  return new Response(
    JSON.stringify({
      success: true,
      result: [{ results, success: true, meta: { changes: 0, last_row_id: 0 } }],
      errors: [],
    }),
    { status: 200 },
  );
}

describe("backups db", () => {
  let originalFetch: typeof globalThis.fetch;
  const env = process.env;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    process.env = {
      ...env,
      D1_ACCOUNT_ID: "mock-account",
      D1_DATABASE_ID: "mock-db",
      D1_API_TOKEN: "mock-token",
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = env;
  });

  describe("getBackupFileKeys", () => {
    test("returns all file_key and json_key for a project", async () => {
      let capturedBody = "";
      const mockRows = [
        { file_key: "f1", json_key: "j1" },
        { file_key: "f2", json_key: null },
        { file_key: "f3", json_key: "j3" },
      ];

      globalThis.fetch = mockFetch(async (_input, init) => {
        capturedBody = init?.body as string;
        return d1Success(mockRows);
      });

      const keys = await getBackupFileKeys("proj-123");

      expect(keys).toEqual(["f1", "j1", "f2", "f3", "j3"]);

      const body = JSON.parse(capturedBody);
      expect(body.sql).toContain("SELECT file_key, json_key FROM backups WHERE project_id = ?");
      expect(body.params).toEqual(["proj-123"]);
    });

    test("returns empty array when no backups found", async () => {
      globalThis.fetch = mockFetch(async () => d1Success([]));

      const keys = await getBackupFileKeys("proj-empty");
      expect(keys).toEqual([]);
    });

    test("handles only null json_keys", async () => {
      const mockRows = [
        { file_key: "f1", json_key: null },
        { file_key: "f2", json_key: null },
      ];

      globalThis.fetch = mockFetch(async () => d1Success(mockRows));

      const keys = await getBackupFileKeys("proj-123");
      expect(keys).toEqual(["f1", "f2"]);
    });
  });
});
