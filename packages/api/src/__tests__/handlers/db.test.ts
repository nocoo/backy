import { describe, expect, test, beforeEach, mock } from "bun:test";

let mockInitialize: () => Promise<void> = async () => {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockExecuteD1Query: (...args: any[]) => Promise<any[]> = async () => [];
let mockDeleteFromR2: (key: string) => Promise<void> = async () => {};

mock.module("../../lib/db/schema", () => ({
  initializeSchema: () => mockInitialize(),
}));

mock.module("../../lib/db/d1-client", () => ({
  executeD1Query: (...args: unknown[]) => mockExecuteD1Query(...args),
  isD1Configured: () => true,
}));

mock.module("../../lib/r2/client", () => ({
  deleteFromR2: (k: string) => mockDeleteFromR2(k),
  pingR2: async () => {},
  isR2Configured: () => true,
  uploadToR2: async () => {},
  downloadFromR2: async () => new Uint8Array(),
  createPresignedDownloadUrl: async () => "https://example.com",
}));

const { dbInitHandler, seedTestProjectHandler } = await import(
  "../../handlers/db"
);

describe("db handlers", () => {
  beforeEach(() => {
    mockInitialize = async () => {};
    mockExecuteD1Query = async () => [];
    mockDeleteFromR2 = async () => {};
    delete process.env.E2E_SKIP_AUTH;
  });

  test("dbInit 200 on success", async () => {
    expect((await dbInitHandler()).status).toBe(200);
  });

  test("dbInit 500 on error", async () => {
    mockInitialize = async () => {
      throw new Error("schema failed");
    };
    expect((await dbInitHandler()).status).toBe(500);
  });

  test("seed 403 without E2E_SKIP_AUTH", async () => {
    expect((await seedTestProjectHandler()).status).toBe(403);
  });

  test("seed creates when not exists", async () => {
    process.env.E2E_SKIP_AUTH = "true";
    let call = 0;
    mockExecuteD1Query = async () => {
      call++;
      // first call: orphaned backups, second: existing project, third: insert
      if (call === 1) return [];
      if (call === 2) return [];
      return [];
    };
    const r = await seedTestProjectHandler();
    expect(r.status).toBe(200);
    expect((r as { body: { action: string } }).body.action).toBe("created");
  });

  test("seed verifies clean existing", async () => {
    process.env.E2E_SKIP_AUTH = "true";
    let call = 0;
    mockExecuteD1Query = async () => {
      call++;
      if (call === 1) return [];
      // existing project clean
      return [
        {
          name: "Backy E2E Test",
          webhook_token: "e2e_test_webhook_token_do_not_use_in_production",
          description: "E2E test project — auto-managed, do not delete",
          allowed_ips: null,
          category_id: null,
          auto_backup_enabled: 0,
          auto_backup_interval: 24,
          auto_backup_webhook: null,
          auto_backup_header_key: null,
          auto_backup_header_value: null,
        },
      ];
    };
    const r = await seedTestProjectHandler();
    expect(r.status).toBe(200);
  });

  test("seed cleans orphaned backups", async () => {
    process.env.E2E_SKIP_AUTH = "true";
    let call = 0;
    mockExecuteD1Query = async () => {
      call++;
      if (call === 1)
        return [{ id: "b1", file_key: "a", json_key: "b" }];
      if (call === 2) return []; // delete backups
      return []; // existing project lookup
    };
    const r = await seedTestProjectHandler();
    expect(r.status).toBe(200);
  });

  test("seed 500 on db error", async () => {
    process.env.E2E_SKIP_AUTH = "true";
    mockExecuteD1Query = async () => {
      throw new Error("db");
    };
    expect((await seedTestProjectHandler()).status).toBe(500);
  });

  test("seed resets dirty existing", async () => {
    process.env.E2E_SKIP_AUTH = "true";
    let call = 0;
    mockExecuteD1Query = async () => {
      call++;
      if (call === 1) return [];
      if (call === 2)
        return [
          {
            name: "Wrong",
            webhook_token: "x",
            description: null,
            allowed_ips: "1.1.1.1",
            category_id: "c",
            auto_backup_enabled: 1,
            auto_backup_interval: 12,
            auto_backup_webhook: "https://x",
            auto_backup_header_key: "k",
            auto_backup_header_value: "v",
          },
        ];
      return [];
    };
    const r = await seedTestProjectHandler();
    expect(r.status).toBe(200);
    expect((r as { body: { action: string } }).body.action).toBe("reset");
  });
});
