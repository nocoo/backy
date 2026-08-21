import { describe, expect, test, beforeEach, vi } from "vitest";
import { makeMockCtx, makeMockR2, CRON_LOG_STUBS, PROJECT_STUBS } from "../helpers";
import type { DirectUploadRow } from "../../lib/db/direct-uploads";

let mockList: () => Promise<DirectUploadRow[]> = async () => [];
let mockUpdate: (input: unknown) => Promise<void> = async () => {};
let mockDeleteArchived: () => Promise<void> = async () => {};
let mockGetBackupByFileKey: (key: string) => Promise<any> = async () =>
  undefined;
let mockCron: () => Promise<{ kind: "json"; status: number; body: unknown }> =
  async () => ({ kind: "json", status: 200, body: { ok: true } });

vi.doMock("../../lib/db/direct-uploads", async () => {
  const actual = await vi.importActual<
    typeof import("../../lib/db/direct-uploads")
  >("../../lib/db/direct-uploads");
  return {
    ...actual,
    listGcBatch: () => mockList(),
    updateDirectUploadGc: (_db: unknown, input: unknown) => mockUpdate(input),
    deleteArchivedDirectUploads: () => mockDeleteArchived(),
  };
});

vi.doMock("../../lib/db/backups", () => ({
  getBackupByFileKey: (_db: unknown, key: string) => mockGetBackupByFileKey(key),
}));

vi.doMock("../../handlers/cron", () => ({
  cronTriggerHandler: () => mockCron(),
}));

vi.doMock("../../lib/db/cron-logs", () => ({ ...CRON_LOG_STUBS }));
vi.doMock("../../lib/db/projects", () => ({ ...PROJECT_STUBS }));

const { gcDirectUploads, runHourlyJobs } = await import("../../handlers/gc");

function row(overrides: Partial<DirectUploadRow> = {}): DirectUploadRow {
  return {
    id: "u1",
    project_id: "p1",
    file_key: "backups/p1/direct/u1.bin",
    staging_key: "direct-staging/p1/u1/in.bin",
    file_name: "a.bin",
    content_type: "application/octet-stream",
    declared_size: 4,
    environment: null,
    tag: null,
    sender_ip: null,
    status: "pending",
    expires_at: 10,
    purge_after: 20,
    reap_until: 30,
    lease_expires_at: null,
    lease_token: null,
    next_gc_at: 1,
    purged_at: null,
    backup_id: null,
    created_at: 1,
    completed_at: null,
    ...overrides,
  };
}

describe("gcDirectUploads", () => {
  const updates: unknown[] = [];
  beforeEach(() => {
    updates.length = 0;
    mockUpdate = async (input) => {
      updates.push(input);
    };
    mockDeleteArchived = async () => {};
    mockGetBackupByFileKey = async () => undefined;
  });

  test("completed with backup isolates staging delete failure", async () => {
    mockList = async () => [row({ status: "completed" })];
    mockGetBackupByFileKey = async () => ({ id: "b1", project_id: "p1" });
    const r2 = makeMockR2({
      delete: async () => {
        throw new Error("staging");
      },
    });
    await gcDirectUploads(makeMockCtx({ r2 }), 100);
    expect(updates[0]).toMatchObject({ nextGcAt: 3700 });
  });

  test("sweepOne outer catch advances next_gc_at", async () => {
    mockList = async () => [row({ status: "pending", purge_after: 9_000 })];
    let n = 0;
    mockUpdate = async () => {
      n++;
      if (n === 1) throw new Error("db");
    };
    await gcDirectUploads(makeMockCtx(), 100);
    expect(n).toBe(2);
  });

  test("completed with backup deletes staging only", async () => {
    mockList = async () => [row({ status: "completed" })];
    mockGetBackupByFileKey = async () => ({ id: "b1", project_id: "p1" });
    const r2 = makeMockR2();
    await gcDirectUploads(makeMockCtx({ r2 }), 100);
    expect(r2.deletes).toEqual(["direct-staging/p1/u1/in.bin"]);
    expect(updates[0]).toMatchObject({ id: "u1" });
  });

  test("pending past purge deletes both keys and expires", async () => {
    mockList = async () => [row({ status: "pending", purge_after: 10, reap_until: 50 })];
    const r2 = makeMockR2();
    await gcDirectUploads(makeMockCtx({ r2 }), 40);
    expect(r2.deletes).toEqual([
      "direct-staging/p1/u1/in.bin",
      "backups/p1/direct/u1.bin",
    ]);
    expect(updates[0]).toMatchObject({ status: "expired" });
    expect(updates[0]).not.toHaveProperty("purgedAt");
  });

  test("sets purged_at after reap_until and isolates delete failures", async () => {
    mockList = async () => [
      row({ status: "aborted", purge_after: 10, reap_until: 20 }),
    ];
    const r2 = makeMockR2({
      delete: async () => {
        throw new Error("r2");
      },
    });
    await gcDirectUploads(makeMockCtx({ r2 }), 40);
    expect(updates[0]).toMatchObject({ nextGcAt: 3640 });

    mockList = async () => [
      row({ status: "aborted", purge_after: 10, reap_until: 20 }),
    ];
    await gcDirectUploads(makeMockCtx({ r2: makeMockR2() }), 40);
    expect(updates.at(-1)).toMatchObject({ purgedAt: 40, status: "aborted" });
  });

  test("completing with live lease skips; expired lease attaches backup", async () => {
    mockList = async () => [
      row({
        status: "completing",
        lease_expires_at: 500,
        purge_after: 800,
      }),
    ];
    await gcDirectUploads(makeMockCtx(), 100);
    expect(updates[0]).toMatchObject({ nextGcAt: expect.any(Number) });

    mockList = async () => [
      row({ status: "completing", lease_expires_at: 10 }),
    ];
    mockGetBackupByFileKey = async () => ({ id: "b9", project_id: "p1" });
    await gcDirectUploads(makeMockCtx(), 100);
    expect(updates.at(-1)).toMatchObject({
      id: "u1",
      nextGcAt: 100 + 7 * 24 * 3600,
    });
  });

  test("otherwise advances next_gc_at when not yet purgeable", async () => {
    mockList = async () => [row({ status: "pending", purge_after: 9_000 })];
    await gcDirectUploads(makeMockCtx(), 100);
    expect(updates[0]).toMatchObject({ nextGcAt: expect.any(Number) });
  });

  test("processes a full batch then a short batch", async () => {
    let pass = 0;
    mockList = async () => {
      pass++;
      if (pass === 1) {
        return Array.from({ length: 100 }, (_, i) =>
          row({ id: `u${i}`, purge_after: 9_000 }),
        );
      }
      return [];
    };
    await gcDirectUploads(makeMockCtx(), 100);
    expect(pass).toBe(2);
  });

  test("expired completing without backup is purged", async () => {
    mockList = async () => [
      row({
        status: "completing",
        lease_expires_at: 1,
        purge_after: 10,
        reap_until: 20,
      }),
    ];
    await gcDirectUploads(makeMockCtx({ r2: makeMockR2() }), 40);
    expect(updates.at(-1)).toMatchObject({ status: "expired" });
  });

  test("runHourlyJobs still GCs when auto-backup fails, then rethrows", async () => {
    mockCron = async () => ({ kind: "json", status: 500, body: { error: "x" } });
    mockList = async () => [];
    await expect(
      runHourlyJobs(makeMockCtx(), { authorization: "Bearer x" }),
    ).rejects.toThrow(/cron trigger failed/);
    mockCron = async () => {
      throw new Error("cron down");
    };
    await expect(
      runHourlyJobs(makeMockCtx(), { authorization: null }),
    ).rejects.toThrow("cron down");
    mockCron = async () => ({ kind: "json", status: 200, body: {} });
    mockList = async () => {
      throw new Error("gc boom");
    };
    await expect(
      runHourlyJobs(makeMockCtx(), { authorization: "Bearer x" }),
    ).resolves.toBeUndefined();
  });
});
