import { beforeEach, describe, expect, test } from "vitest";
import { makeMockCtx, makeMockD1, makeMockR2 } from "../helpers";
import {
  dbInitHandler,
  getTestMarkerHandler,
  seedTestProjectHandler,
} from "../../handlers/db";

describe("db handlers", () => {
  let db: ReturnType<typeof makeMockD1>;
  let r2: ReturnType<typeof makeMockR2>;

  beforeEach(() => {
    db = makeMockD1();
    r2 = makeMockR2();
  });

  test("dbInit 200 on success", async () => {
    expect((await dbInitHandler(makeMockCtx({ db, r2 }))).status).toBe(200);
  });

  test("dbInit 500 on error", async () => {
    db = makeMockD1(async (sql) => {
      if (sql.includes("CREATE TABLE")) {
        throw new Error("schema failed");
      }
      return { results: [] };
    });

    expect((await dbInitHandler(makeMockCtx({ db, r2 }))).status).toBe(500);
  });

  test("seed 403 without E2E_SKIP_AUTH", async () => {
    expect(
      (
        await seedTestProjectHandler(
          makeMockCtx({ db, r2, env: { E2E_SKIP_AUTH: "false" } }),
        )
      ).status,
    ).toBe(403);
  });

  test("seed creates when not exists", async () => {
    let call = 0;
    db = makeMockD1(async () => {
      call++;
      if (call === 1) return { results: [] };
      if (call === 2) return { results: [] };
      return { results: [] };
    });

    const r = await seedTestProjectHandler(
      makeMockCtx({ db, r2, env: { E2E_SKIP_AUTH: "true" } }),
    );
    expect(r.status).toBe(200);
    expect((r as { body: { action: string } }).body.action).toBe("created");
  });

  test("seed verifies clean existing", async () => {
    let call = 0;
    db = makeMockD1(async () => {
      call++;
      if (call === 1) return { results: [] };
      return {
        results: [
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
        ],
      };
    });

    const r = await seedTestProjectHandler(
      makeMockCtx({ db, r2, env: { E2E_SKIP_AUTH: "true" } }),
    );
    expect(r.status).toBe(200);
  });

  test("seed cleans orphaned backups", async () => {
    let call = 0;
    db = makeMockD1(async () => {
      call++;
      if (call === 1) {
        return { results: [{ id: "b1", file_key: "a", json_key: "b" }] };
      }
      if (call === 2) return { results: [] };
      return { results: [] };
    });

    const r = await seedTestProjectHandler(
      makeMockCtx({ db, r2, env: { E2E_SKIP_AUTH: "true" } }),
    );
    expect(r.status).toBe(200);
    expect(r2.deletes).toEqual(["a", "b"]);
  });

  test("seed 500 on db error", async () => {
    db = makeMockD1(async () => {
      throw new Error("db");
    });

    expect(
      (
        await seedTestProjectHandler(
          makeMockCtx({ db, r2, env: { E2E_SKIP_AUTH: "true" } }),
        )
      ).status,
    ).toBe(500);
  });

  test("seed resets dirty existing", async () => {
    let call = 0;
    db = makeMockD1(async () => {
      call++;
      if (call === 1) return { results: [] };
      if (call === 2) {
        return {
          results: [
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
          ],
        };
      }
      return { results: [] };
    });

    const r = await seedTestProjectHandler(
      makeMockCtx({ db, r2, env: { E2E_SKIP_AUTH: "true" } }),
    );
    expect(r.status).toBe(200);
    expect((r as { body: { action: string } }).body.action).toBe("reset");
  });

  test("getTestMarker returns marker when present", async () => {
    db = makeMockD1(async () => ({ results: [{ id: "e2e-test-db" }] }));
    const r = await getTestMarkerHandler(makeMockCtx({ db, r2 }));
    expect(r.status).toBe(200);
    expect((r as { body: { marker: string } }).body.marker).toBe("e2e-test-db");
  });

  test("getTestMarker returns null when not present", async () => {
    db = makeMockD1(async () => ({ results: [] }));
    const r = await getTestMarkerHandler(makeMockCtx({ db, r2 }));
    expect(r.status).toBe(200);
    expect((r as { body: { marker: null } }).body.marker).toBeNull();
  });

  test("getTestMarker returns error info on failure", async () => {
    db = makeMockD1(async () => {
      throw new Error("table not found");
    });
    const r = await getTestMarkerHandler(makeMockCtx({ db, r2 }));
    expect(r.status).toBe(200);
    expect((r as { body: { marker: null; error: string } }).body.marker).toBeNull();
    expect((r as { body: { error: string } }).body.error).toBe("table not found");
  });
});
