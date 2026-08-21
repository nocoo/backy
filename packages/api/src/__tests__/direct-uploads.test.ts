import { describe, expect, test } from "vitest";
import { makeMockD1 } from "./helpers";
import {
  abortCompletingWithLease,
  abortPendingDirectUpload,
  attachCompletedBackup,
  changesOf,
  claimDirectUpload,
  completeDirectUpload,
  deleteArchivedDirectUploads,
  getDirectUpload,
  insertPendingDirectUpload,
  listGcBatch,
  purgeUnissuedDirectUpload,
  renewDirectUploadLease,
  updateDirectUploadGc,
} from "../lib/db/direct-uploads";

const row = {
  id: "u1",
  projectId: "p1",
  fileKey: "backups/p1/direct/u1.bin",
  stagingKey: "direct-staging/p1/u1/in.bin",
  fileName: "dump.bin",
  contentType: "application/octet-stream",
  declaredSize: 10,
  environment: null,
  tag: null,
  senderIp: "1.1.1.1",
  expiresAt: 100,
  purgeAfter: 200,
  reapUntil: 300,
  nextGcAt: 200,
  createdAt: 50,
};

describe("direct-uploads db", () => {
  test("changesOf defaults to 0", () => {
    expect(changesOf(undefined)).toBe(0);
    expect(changesOf({ changes: 2 })).toBe(2);
  });

  test("insertPendingDirectUpload encodes quotas and returns false on 0 changes", async () => {
    const db = makeMockD1(() => ({ results: [], meta: { changes: 0 } }));
    expect(await insertPendingDirectUpload(db, row)).toBe(false);
    const sql = db.calls[0]?.sql ?? "";
    expect(sql).toContain("INSERT INTO direct_uploads");
    expect(sql).toContain("< 20");
    expect(sql).toContain("< 30");
    expect(sql).toContain("< 200");
    expect(sql).toContain("21474836480");
    expect(sql).toContain("107374182400");
    expect(sql).toContain("536870912000");
  });

  test("insertPendingDirectUpload returns true when D1 reports a change", async () => {
    const db = makeMockD1(() => ({ results: [], meta: { changes: 1 } }));
    expect(await insertPendingDirectUpload(db, row)).toBe(true);
  });

  test("get/claim/abort/renew/complete/gc helpers issue the expected SQL", async () => {
    const db = makeMockD1((sql) => {
      if (sql.startsWith("SELECT * FROM direct_uploads WHERE id")) {
        return { results: [{ id: "u1", status: "pending" }] };
      }
      if (sql.includes("ORDER BY next_gc_at")) {
        return { results: [{ id: "u1" }] };
      }
      return { results: [], meta: { changes: 1 } };
    });
    expect((await getDirectUpload(db, "u1", "p1"))?.id).toBe("u1");
    expect(
      await claimDirectUpload(db, {
        id: "u1",
        projectId: "p1",
        leaseToken: "tok",
        now: 10,
        leaseExpiresAt: 910,
      }),
    ).toBe(true);
    expect(await abortPendingDirectUpload(db, "u1", "p1")).toBe(true);
    await abortCompletingWithLease(db, "u1", "tok");
    expect(
      await renewDirectUploadLease(db, {
        id: "u1",
        leaseToken: "tok",
        now: 10,
        leaseExpiresAt: 910,
      }),
    ).toBe(true);
    expect(
      await completeDirectUpload(db, {
        id: "u1",
        leaseToken: "tok",
        backupId: "b1",
        now: 11,
      }),
    ).toBe(true);
    await attachCompletedBackup(db, { id: "u1", backupId: "b1", now: 11 });
    expect(await listGcBatch(db, 20, 100)).toEqual([{ id: "u1" }]);
    await updateDirectUploadGc(db, {
      id: "u1",
      nextGcAt: 99,
      status: "expired",
      purgedAt: 99,
      backupId: "b1",
    });
    await updateDirectUploadGc(db, { id: "u1", nextGcAt: 100 });
    await purgeUnissuedDirectUpload(db, "u1", 50);
    await deleteArchivedDirectUploads(db, 1);
    expect(db.calls.some((c) => c.sql.includes("DELETE FROM direct_uploads"))).toBe(
      true,
    );
  });
});
