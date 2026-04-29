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
    const r = await dbInitHandler(makeMockCtx({ db, r2 }));
    expect(r.status).toBe(200);
    // Tightened: pin the success body shape ({ok:true, message}).
    expect(r.kind).toBe("json");
    expect((r as { body: unknown }).body).toEqual({
      ok: true,
      message: "Schema initialized",
    });
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
    expect(r.kind).toBe("json");
    // Tightened: pin the full created-branch shape with TEST_PROJECT id
    // + token. cleanedBackups=0 because the orphans query returns [].
    expect((r as { body: unknown }).body).toEqual({
      action: "created",
      projectId: "mnp039joh6yiala5UY0Hh",
      webhookToken: "wDzglaK3i-tTUmHsTsCdTWQVTeZWSn9tGfCaW4lR1f3JPGzJ",
      cleanedBackups: 0,
    });
  });

  test("seed verifies clean existing", async () => {
    let call = 0;
    db = makeMockD1(async () => {
      call++;
      if (call === 1) return { results: [] };
      return {
        results: [
          {
            // Must match TEST_PROJECT exactly (name='backy-test', etc.)
            // for the handler to take the 'verified' branch instead of
            // 'reset'. The previous fixture had "Backy E2E Test", which
            // silently fell through to 'reset' — the test only checked
            // status=200, masking the misnamed branch.
            name: "backy-test",
            webhook_token: "wDzglaK3i-tTUmHsTsCdTWQVTeZWSn9tGfCaW4lR1f3JPGzJ",
            description: "E2E test project — auto-seeded",
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
    // Tightened: pin the verified-branch contract: action='verified',
    // cleanedBackups=0. The previous fixture had a name-drift bug that
    // hid the verified branch from coverage entirely.
    expect(r.kind).toBe("json");
    expect((r as { body: Record<string, unknown> }).body).toMatchObject({
      action: "verified",
      cleanedBackups: 0,
    });
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
    // Tightened: also pin the body action='created' (handler creates
    // the row when the project doesn't exist) and cleanedBackups=1
    // (the one orphaned backup we set up above).
    expect(r.kind).toBe("json");
    expect((r as { body: Record<string, unknown> }).body).toMatchObject({
      action: "created",
      cleanedBackups: 1,
    });
  });

  test("seed 500 on db error", async () => {
    db = makeMockD1(async () => {
      throw new Error("db");
    });

    const r = await seedTestProjectHandler(
      makeMockCtx({ db, r2, env: { E2E_SKIP_AUTH: "true" } }),
    );
    expect(r.status).toBe(500);
    expect(r.kind).toBe("json");
    // Tightened: handler surfaces the raw error message via String(err).
    // 'Error: db' is the toString of `new Error('db')`.
    expect((r as { body: unknown }).body).toEqual({ error: "Error: db" });
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
    expect(r.kind).toBe("json");
    // Tightened: pin the full reset-branch envelope. cleanedBackups=0
    // because orphans query returns []. projectId+webhookToken come
    // from TEST_PROJECT (the handler resets the row to canonical state).
    expect((r as { body: unknown }).body).toEqual({
      action: "reset",
      projectId: "mnp039joh6yiala5UY0Hh",
      webhookToken: "wDzglaK3i-tTUmHsTsCdTWQVTeZWSn9tGfCaW4lR1f3JPGzJ",
      cleanedBackups: 0,
    });
  });

  test("getTestMarker returns marker when present", async () => {
    db = makeMockD1(async () => ({ results: [{ id: "e2e-test-db" }] }));
    const r = await getTestMarkerHandler(makeMockCtx({ db, r2 }));
    expect(r.status).toBe(200);
    expect(r.kind).toBe("json");
    expect((r as { body: unknown }).body).toEqual({ marker: "e2e-test-db" });
  });

  test("getTestMarker returns null when not present", async () => {
    db = makeMockD1(async () => ({ results: [] }));
    const r = await getTestMarkerHandler(makeMockCtx({ db, r2 }));
    expect(r.status).toBe(200);
    expect(r.kind).toBe("json");
    expect((r as { body: unknown }).body).toEqual({ marker: null });
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
