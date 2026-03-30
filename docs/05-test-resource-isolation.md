# 05 — Test Resource Isolation: Dedicated D1 + R2 for E2E

> Standardize Cloudflare resource naming. Separate production and test resources. Ensure no E2E test can corrupt production data.

## Background

Backy currently uses a **single set of Cloudflare D1 + R2** for both production and all E2E tests:

| Resource | Current Name | UUID |
|---|---|---|
| D1 database | `backy` | `<old-uuid>` (superseded) |
| R2 bucket | `backy` | — |

E2E tests (L2 API E2E + L3 Playwright BDD) start a dedicated Next.js dev server with `...process.env`, inheriting production D1/R2 credentials. The only protection is logical isolation — a dedicated `backy-test` project with cleanup routines. If a test bug skips cleanup or targets the wrong project, production data is at risk.

### Current Risk

```
.env (production credentials)
    ↓ ...process.env
scripts/run-e2e.ts → dev server :17017 → SAME D1 + R2 as production
e2e/bdd/runner.ts  → dev server :27017 → SAME D1 + R2 as production
```

## Target Naming Convention

| Resource | Current | Production (renamed) | Test (new) |
|---|---|---|---|
| D1 database | `backy` | `backy-db` | `backy-db-test` |
| R2 bucket | `backy` | `backy` (already correct) | `backy-test` |

Pattern: `<product>-db` / `<product>-db-test` for D1, `<product>` / `<product>-test` for R2.

## D1 Rename Strategy

D1 does not support rename. The migration path is export → create → import → swap credentials:

```
backy (old, uuid a5bdd8e1-...)
  ↓ wrangler d1 export
  dump.sql
  ↓ wrangler d1 execute
backy-db (new, uuid <new>)
  ↓ update .env D1_DATABASE_ID
  ✅ app now points to backy-db

  ↓ verify everything works
  ↓ wrangler d1 delete backy
  🗑️ old database removed
```

**What references the D1 UUID:**
- `.env` → `D1_DATABASE_ID=<uuid>` — local dev + E2E source of truth
- Railway env vars → `D1_DATABASE_ID=<uuid>` — production deployment
- The cron worker (`worker/wrangler.toml`) does NOT reference D1 directly — it calls the HTTP API

**Migration is safe because:**
1. The codebase uses `D1_DATABASE_ID` (UUID), never the human-readable name
2. Swapping the UUID in `.env` and Railway is the only change needed
3. D1 export produces a complete SQL dump (schema + data)
4. We can verify the new database before deleting the old one

## Target Architecture

```
.env (production)                .env.test (test overrides)
  D1_DATABASE_ID=<backy-db-uuid>   D1_DATABASE_ID=<backy-db-test-uuid>
  R2_BUCKET_NAME=backy              R2_BUCKET_NAME=backy-test

Dev server (port 7017)           E2E servers (port 17017, 27017)
  → reads .env                     → reads .env, then overrides with .env.test
  → hits backy-db D1 + backy R2    → hits backy-db-test D1 + backy-test R2
```

### Key Design Decisions

1. **`.env.test` override file** — Contains only the two variables that differ: `D1_DATABASE_ID` and `R2_BUCKET_NAME`. All other credentials (account ID, API tokens, access keys) are shared — they authenticate the same Cloudflare account.

2. **E2E runners load `.env.test`** — Both `scripts/run-e2e.ts` and `e2e/bdd/runner.ts` read `.env.test` and merge into the env passed to the child dev server, overriding production values.

3. **`loadTestEnv()` self-contained safety — no reliance on implicit runtime behavior** — The three-layer safety in `loadTestEnv()` explicitly parses `.env` from disk to get production values for comparison, rather than reading `process.env`. This eliminates the assumption that Bun auto-loads `.env` before our code runs. While Bun does auto-load `.env` (documented at bun.sh/docs/runtime/env), making the safety check self-contained means it works regardless of runtime, invocation method, or future Bun behavior changes. The child server env is still built as `{ ...process.env, ...overrides }` — Bun's auto-loading provides the non-overridden credentials (D1_ACCOUNT_ID, API tokens, etc.) to `process.env`, and `loadTestEnv()` layers the test-specific values on top.

   **Note on `.env.test` auto-loading:** Bun also auto-loads `.env.test` when `NODE_ENV=test`, but our E2E runners do NOT set `NODE_ENV=test`, so Bun's built-in `.env.test` loading does not conflict with our custom `loadTestEnv()` loader. The custom loader is needed because we want to validate overrides before spawning the child server.

4. **L1 unit tests unaffected** — They mock `fetch` and never touch real D1/R2. No changes needed.

5. **R2 S3Client singleton** — `src/lib/r2/client.ts` caches the S3Client in a module-level `_client` variable. Since E2E servers are fresh child processes (spawned by runners), the singleton initializes with the overridden env — no code change needed in `client.ts`.

5. **Schema initialization** — The test D1 database starts empty. The existing `initializeSchema()` is called via `/api/db/init`. We add an explicit schema init call in the E2E runner startup sequence to ensure the test database is ready.

6. **`backy-test` project seed via narrow endpoint with full baseline reset and pre-run cleanup** — The hardcoded `backy-test` project (ID: `mnp039joh6yiala5UY0Hh`, token: `wDzglaK3i-...`) currently exists in the production D1. After isolation, it must be seeded in the test D1. The `POST /api/projects` endpoint does NOT accept `id` or `webhookToken` — `createProject()` generates them internally. Therefore, we add a purpose-built `POST /api/db/seed-test-project` endpoint that imports constants from a shared `src/lib/test-project.ts` module (single source of truth). It creates if missing, verifies if all fields match baseline, or performs a **full reset** of ALL mutable fields (name, description, token, allowed_ips, category_id, auto_backup_*) to prevent dirty leftover state from prior runs. Additionally, it **deletes all orphaned backups** (D1 rows + R2 objects) belonging to the test project from prior crashed runs, preventing stale data from polluting BDD specs. Gated by `E2E_SKIP_AUTH=true`. Both L2 and L3 runners call this after schema init.

## Gap Analysis

| Item | Current | Target | Action |
|---|---|---|---|
| D1 prod name | `backy` (no suffix) | `backy-db` | Export → create → import → swap |
| D1 test database | ❌ None | `backy-db-test` | `wrangler d1 create backy-db-test` |
| R2 test bucket | ❌ None | `backy-test` | `wrangler r2 bucket create backy-test` |
| `.env.test` | ❌ None | Override file with test D1/R2 | New file |
| `.env.example` | No test section | Document `.env.test` convention | Update |
| E2E runner (L2) | Inherits prod env | Loads `.env.test` overrides | Modify `scripts/run-e2e.ts` |
| E2E runner (L3) | Inherits prod env | Loads `.env.test` overrides | Modify `e2e/bdd/runner.ts` |
| E2E seed data | Hardcoded project in prod D1 | Self-bootstrapping seed in test D1 | Add seed step to E2E runner |
| `.gitignore` | `.env*` glob | Already covers `.env.test` | No change needed |
| Railway env | Points to old D1 UUID | Points to new `backy-db` UUID | Manual update |
| CLAUDE.md | No test isolation docs | Document test resource isolation | Update |

## File Modification Map

| File | Change | Reason |
|---|---|---|
| `.env` | Update `D1_DATABASE_ID` to new `backy-db` UUID | D1 rename |
| `.env.test` | **New file** | Test D1/R2 overrides |
| `.env.example` | Add `.env.test` section | Document convention |
| `scripts/load-env-test.ts` | **New file** | Shared `.env.test` loader with three-layer safety |
| `scripts/run-e2e.ts` | Load `.env.test`, merge into child env, seed test project | Test isolation for L2 |
| `e2e/bdd/runner.ts` | Load `.env.test`, merge into child env, seed test project | Test isolation for L3 |
| `e2e/api/config.ts` | Re-export from `test-project.ts`, add `seedTestProject()` | Single source of truth + deterministic seed |
| `src/lib/test-project.ts` | **New file** | Shared test project constants (ID, name, token) |
| `src/app/api/db/seed-test-project/route.ts` | **New file** | Narrow seed endpoint: create/verify/reset + pre-run backup cleanup, gated by `E2E_SKIP_AUTH` |
| `CLAUDE.md` | Document test resource naming, isolation, and seed mechanism | Knowledge preservation |
| `README.md` | Update E2E description to mention test D1/R2 isolation | Sync documentation |

## Atomic Commits

### Phase A: D1 Rename (production database `backy` → `backy-db`)

### Commit 1: `chore: rename production D1 database to backy-db`

**Manual infrastructure steps:**

```bash
# 1. Export current database
wrangler d1 export backy --output=backy-export.sql

# 2. Create new database with correct name
wrangler d1 create backy-db
# → note the new UUID from output

# 3. Import data into new database
wrangler d1 execute backy-db --file=backy-export.sql

# 4. Verify data integrity — ALL 5 tables
wrangler d1 execute backy-db --command "SELECT 'projects' AS t, count(*) AS n FROM projects UNION ALL SELECT 'backups', count(*) FROM backups UNION ALL SELECT 'categories', count(*) FROM categories UNION ALL SELECT 'webhook_logs', count(*) FROM webhook_logs UNION ALL SELECT 'cron_logs', count(*) FROM cron_logs"
# Compare counts with old database:
wrangler d1 execute backy --command "SELECT 'projects' AS t, count(*) AS n FROM projects UNION ALL SELECT 'backups', count(*) FROM backups UNION ALL SELECT 'categories', count(*) FROM categories UNION ALL SELECT 'webhook_logs', count(*) FROM webhook_logs UNION ALL SELECT 'cron_logs', count(*) FROM cron_logs"
```

**Files:**
- `.env` — update `D1_DATABASE_ID` to the new `backy-db` UUID

**Post-commit manual steps:**
```bash
# 5. Update Railway production environment variable
railway variables set D1_DATABASE_ID=<new-backy-db-uuid>

# 6. Verify production is working
curl https://your-domain.example.com/api/live

# 7. Verify local dev server works
bun dev
# → check dashboard loads, data is intact

# 8. Keep old database for 48h as safety net, then delete
# (after confirming everything works)
# wrangler d1 delete backy
```

**Verification:**
- Local dev server reads data from `backy-db`
- Production deployment reads data from `backy-db` (after Railway env update)
- Row counts match between old and new database
- Clean up `backy-export.sql` after verification

---

### Phase B: Test Resource Isolation

### Commit 2: `chore: create test D1 database and R2 bucket`

**Manual infrastructure steps:**

```bash
# Create test D1 database
wrangler d1 create backy-db-test
# → note the UUID

# Create test R2 bucket
wrangler r2 bucket create backy-test
```

**Files:**
- `.env.test` — new file:
  ```bash
  # Test resource overrides — loaded by E2E runners
  # These override the production values from .env
  D1_DATABASE_ID=<uuid-from-wrangler-d1-create>
  R2_BUCKET_NAME=backy-test
  ```
- `.env.example` — add test section at bottom:
  ```bash
  # -------------------------------------------
  # Test Resource Overrides (.env.test)
  # -------------------------------------------
  # E2E tests use separate D1 + R2 to avoid corrupting production.
  # Create a .env.test file with these overrides:
  # D1_DATABASE_ID=your-test-d1-database-id
  # R2_BUCKET_NAME=backy-test
  ```
- `.gitignore` — no change needed (existing `.env*` glob already covers `.env.test`)

**Verification:** `wrangler d1 list` shows `backy-db-test`, `wrangler r2 bucket list` shows `backy-test`.

---

### Commit 3: `feat: add env.test loader utility for E2E runners`

**Files:**
- `scripts/load-env-test.ts` — **new file**: utility that reads `.env.test`, validates overrides, and returns a merged env:
  ```typescript
  /**
   * Load .env.test overrides for E2E test isolation.
   *
   * Three-layer safety:
   * 1. File must exist (.env.test)
   * 2. Both D1_DATABASE_ID and R2_BUCKET_NAME must be present in overrides
   * 3. Neither value may equal the production value from .env
   *
   * Layer 3 explicitly parses .env to get production values, rather than
   * relying on Bun's implicit .env auto-loading into process.env. This
   * ensures the safety check works regardless of runtime behavior.
   *
   * If any check fails, the runner aborts — E2E will never silently hit production.
   *
   * Parser handles standard dotenv conventions:
   * - Comments (#) and blank lines are skipped
   * - Surrounding quotes (single or double) are stripped from values
   * - Inline comments after values are stripped (e.g. KEY=value # comment)
   */
  import { readFileSync } from "fs";
  import { join } from "path";

  /** Keys that .env.test MUST override to ensure test isolation. */
  const REQUIRED_OVERRIDES = ["D1_DATABASE_ID", "R2_BUCKET_NAME"] as const;

  /** Strip surrounding quotes and inline comments from a dotenv value. */
  function parseValue(raw: string): string {
    let value = raw.trim();
    // Strip surrounding quotes: "val" or 'val'
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      // Strip inline comment (only when not quoted)
      const hashIndex = value.indexOf(" #");
      if (hashIndex !== -1) {
        value = value.slice(0, hashIndex).trimEnd();
      }
    }
    return value;
  }

  /** Parse a dotenv file into a key-value map. */
  function parseDotenv(filePath: string): Record<string, string> {
    const content = readFileSync(filePath, "utf-8");
    const result: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = parseValue(trimmed.slice(eqIndex + 1));
      result[key] = value;
    }
    return result;
  }

  export function loadTestEnv(): Record<string, string> {
    const projectRoot = process.cwd();
    const envTestPath = join(projectRoot, ".env.test");
    const envPath = join(projectRoot, ".env");

    // Layer 1: .env.test must exist
    let overrides: Record<string, string>;
    try {
      overrides = parseDotenv(envTestPath);
    } catch {
      throw new Error(
        ".env.test not found — E2E tests require separate test resources.\n" +
        "Create .env.test with D1_DATABASE_ID and R2_BUCKET_NAME for the test database/bucket.\n" +
        "See .env.example for details."
      );
    }

    // Layer 2: required keys must be present and non-empty
    for (const key of REQUIRED_OVERRIDES) {
      if (!overrides[key]) {
        throw new Error(
          `.env.test is missing required key: ${key}\n` +
          "Both D1_DATABASE_ID and R2_BUCKET_NAME must be set to test-specific values."
        );
      }
    }

    // Layer 3: test values must differ from production values
    // Explicitly parse .env to get production values — do not rely on
    // Bun's implicit auto-loading, which is a runtime convenience, not
    // a contract we control.
    let prodEnv: Record<string, string> = {};
    try {
      prodEnv = parseDotenv(envPath);
    } catch {
      // .env doesn't exist — can't compare, but also means process.env
      // lacks credentials, so the child server will fail anyway.
    }
    for (const key of REQUIRED_OVERRIDES) {
      const prodValue = prodEnv[key];
      if (prodValue && overrides[key] === prodValue) {
        throw new Error(
          `.env.test ${key} is identical to the production value from .env!\n` +
          `Production: ${prodValue}\n` +
          `Test:       ${overrides[key]}\n` +
          "E2E tests MUST use separate resources. Fix .env.test to point to the test database/bucket."
        );
      }
    }

    return { ...process.env, ...overrides } as Record<string, string>;
  }
  ```

**Design decisions:**
- **Three-layer safety** — (1) file exists, (2) required keys present, (3) values differ from production. Any failure aborts with a clear message. This eliminates the "misconfigured `.env.test` silently hits production" scenario.
- **Simple parser** — No dependency needed for a 2-variable file. Handles comments and blank lines.
- **Shared utility** — Both L2 and L3 runners import this instead of duplicating logic.
- **Comparison uses explicit `.env` parsing** — Layer 3 reads production values by parsing `.env` from disk via `parseDotenv()`, not from `process.env`. This makes the safety check self-contained and independent of runtime auto-loading behavior.

**Verification:**
- `bun -e "import { loadTestEnv } from './scripts/load-env-test'; console.log(loadTestEnv().D1_DATABASE_ID)"` prints the test UUID.
- Negative test — D1: copy production `D1_DATABASE_ID` into `.env.test` → runner aborts with "identical to production value" error.
- Negative test — R2: set `R2_BUCKET_NAME=backy` in `.env.test` (same as production) → runner aborts with "identical to production value" error.

---

### Commit 4: `feat: wire L2 E2E runner to use test resources`

**Files:**
- `scripts/run-e2e.ts` — two changes:
  1. Import `loadTestEnv` and use it instead of `...process.env`:
     ```typescript
     import { loadTestEnv } from "./load-env-test";
     // ...
     const testEnv = loadTestEnv();
     const server = spawn("bun", ["next", "dev", "--port", String(E2E_PORT)], {
       env: {
         ...testEnv,                    // ← test D1 + R2
         E2E_SKIP_AUTH: "true",
         SSRF_ALLOWLIST: `http://localhost:${E2E_PORT}`,
       },
       stdio: ["ignore", "pipe", "pipe"],
     });
     ```
  2. Add schema init + test project seed after server ready:
     ```typescript
     // Initialize test database schema
     console.log("🗄️  Initializing test database schema...");
     await fetch(`${baseUrl}/api/db/init`, { method: "POST" });

     // Seed backy-test project if not exists
     console.log("🌱 Seeding test project...");
     await seedTestProject(baseUrl);
     ```

- `e2e/api/config.ts` — add deterministic seed function and export shared test project constants:
  ```typescript
  // === Test project constants — re-exported from single source of truth ===
  // Uses relative path because e2e/ is excluded from tsconfig.json,
  // making the @/ alias unreliable for path resolution in this context.
  export { TEST_PROJECT } from "../../src/lib/test-project";
  // Aliases for backward compatibility with existing suites
  export const PROJECT_ID = TEST_PROJECT.id;
  export const WEBHOOK_TOKEN = TEST_PROJECT.webhookToken;
  export const PROJECT_NAME = TEST_PROJECT.name;

  /**
   * Ensure the backy-test project exists in a known baseline state.
   *
   * Calls the narrow /api/db/seed-test-project endpoint which:
   * 1. Project doesn't exist → create with all defaults
   * 2. Project exists in correct baseline → no-op
   * 3. Project exists but any field is dirty → full reset to baseline
   *
   * "Baseline" means: correct name, token, and all optional fields
   * (allowed_ips, category_id, auto_backup_*) reset to defaults.
   * This prevents leftover state from prior runs (e.g. allowed_ips
   * causing webhook 403s) from poisoning the current run.
   */
  export async function seedTestProject(baseUrl: string): Promise<void> {
    const seedRes = await fetch(`${baseUrl}/api/db/seed-test-project`, {
      method: "POST",
    });
    if (!seedRes.ok) {
      const err = await seedRes.text();
      throw new Error(`Failed to seed test project: ${err}`);
    }
    const result = await seedRes.json();
    console.log(`  ✅ Test project: ${result.action}${result.cleanedBackups > 0 ? ` (cleaned ${result.cleanedBackups} orphaned backups)` : ""}`); // "created", "verified", or "reset"
  }
  ```

  **Design decision — single source of truth:**
  - `PROJECT_ID`, `WEBHOOK_TOKEN`, `PROJECT_NAME` are re-exported from `src/lib/test-project.ts` via `e2e/api/config.ts`.
  - Existing E2E suites continue to `import { PROJECT_ID, WEBHOOK_TOKEN } from "../config"` unchanged.
  - The seed endpoint also imports from the same `src/lib/test-project.ts`.
  - Since both sides import from the same module, there is no drift risk and no need for runtime cross-checks.

- `src/lib/test-project.ts` — **new file**: shared constants importable by both app code and e2e:
  ```typescript
  /**
   * E2E test project constants — single source of truth.
   *
   * Imported by:
   * - src/app/api/db/seed-test-project/route.ts (server-side seed)
   * - e2e/api/config.ts (test-side seed caller + suites)
   */
  export const TEST_PROJECT = {
    id: "mnp039joh6yiala5UY0Hh",
    name: "backy-test",
    webhookToken: "wDzglaK3i-tTUmHsTsCdTWQVTeZWSn9tGfCaW4lR1f3JPGzJ",
    description: "E2E test project — auto-seeded",
  } as const;
  ```

- `src/app/api/db/seed-test-project/route.ts` — **new file**: narrow, purpose-built seed endpoint:
  ```typescript
  /**
   * POST /api/db/seed-test-project — Ensure the E2E test project exists
   * in a known baseline state: correct name, token, and all optional
   * fields reset to defaults.
   *
   * ONLY available when E2E_SKIP_AUTH=true (test servers).
   * Returns 403 in production.
   *
   * Does NOT accept any user input — all values come from the shared
   * TEST_PROJECT constant in src/lib/test-project.ts.
   *
   * Three outcomes:
   * - "created": project did not exist, inserted with baseline values
   * - "verified": project exists and all fields match baseline
   * - "reset": project exists but one or more fields were dirty, fully reset
   *
   * Additionally, deletes ALL backups (D1 rows + R2 objects) belonging to
   * the test project. This prevents orphaned data from prior crashed runs
   * from polluting the current test run (e.g. BDD specs that click "first
   * backup" seeing stale data instead of freshly uploaded data).
   *
   * "Baseline" resets ALL mutable fields to prevent dirty leftover state:
   * - name, webhook_token (identity fields E2E suites depend on)
   * - allowed_ips → null (prevents webhook 403 from leftover IP restrictions)
   * - category_id → null
   * - auto_backup_enabled → 0, auto_backup_interval → 24
   * - auto_backup_webhook, auto_backup_header_key, auto_backup_header_value → null
   */
  import { NextResponse } from "next/server";
  import { executeD1Query } from "@/lib/db/d1-client";
  import { deleteFromR2 } from "@/lib/r2/client";
  import { TEST_PROJECT } from "@/lib/test-project";

  export async function POST() {
    if (process.env.E2E_SKIP_AUTH !== "true") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id, name, webhookToken, description } = TEST_PROJECT;

    try {
      // --- Pre-run cleanup: remove orphaned backups from prior crashed runs ---
      const orphanedBackups = await executeD1Query<{ id: string; r2_key: string }>(
        "SELECT id, r2_key FROM backups WHERE project_id = ?",
        [id],
      );
      if (orphanedBackups.length > 0) {
        // Delete R2 objects first (best-effort — R2 may already be clean)
        await Promise.allSettled(
          orphanedBackups.map((b) => deleteFromR2(b.r2_key)),
        );
        // Delete D1 rows
        await executeD1Query(
          "DELETE FROM backups WHERE project_id = ?",
          [id],
        );
        console.log(`  🧹 Cleaned ${orphanedBackups.length} orphaned backups`);
      }

      // Check current state
      const existing = await executeD1Query<{
        name: string;
        webhook_token: string;
        description: string | null;
        allowed_ips: string | null;
        category_id: string | null;
        auto_backup_enabled: number;
        auto_backup_interval: number;
        auto_backup_webhook: string | null;
        auto_backup_header_key: string | null;
        auto_backup_header_value: string | null;
      }>(
        `SELECT name, webhook_token, description, allowed_ips, category_id,
                auto_backup_enabled, auto_backup_interval, auto_backup_webhook,
                auto_backup_header_key, auto_backup_header_value
         FROM projects WHERE id = ?`,
        [id],
      );

      if (existing.length === 0) {
        // Create with all defaults
        await executeD1Query(
          `INSERT INTO projects (id, name, description, webhook_token, created_at, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [id, name, description, webhookToken],
        );
        return NextResponse.json({
          action: "created",
          projectId: id,
          webhookToken,
          cleanedBackups: orphanedBackups.length,
        });
      }

      // Check if ALL fields match baseline
      const row = existing[0];
      const isClean =
        row.name === name &&
        row.description === description &&
        row.webhook_token === webhookToken &&
        row.allowed_ips === null &&
        row.category_id === null &&
        row.auto_backup_enabled === 0 &&
        row.auto_backup_interval === 24 &&
        row.auto_backup_webhook === null &&
        row.auto_backup_header_key === null &&
        row.auto_backup_header_value === null;

      if (isClean) {
        return NextResponse.json({
          action: "verified",
          projectId: id,
          webhookToken,
          cleanedBackups: orphanedBackups.length,
        });
      }

      // One or more fields dirty — full reset to baseline
      await executeD1Query(
        `UPDATE projects SET
           name = ?, webhook_token = ?, description = ?,
           allowed_ips = NULL, category_id = NULL,
           auto_backup_enabled = 0, auto_backup_interval = 24,
           auto_backup_webhook = NULL, auto_backup_header_key = NULL,
           auto_backup_header_value = NULL,
           updated_at = datetime('now')
         WHERE id = ?`,
        [name, webhookToken, description, id],
      );
      return NextResponse.json({
        action: "reset",
        projectId: id,
        webhookToken,
        cleanedBackups: orphanedBackups.length,
      });
    } catch (error) {
      return NextResponse.json({ error: String(error) }, { status: 500 });
    }
  }
  ```

**Design decisions:**
- **Pre-run cleanup of orphaned backups** — Prior crashed E2E runs may leave backup rows in D1 and objects in R2. Without cleanup, BDD specs that click "first backup" would see stale data instead of freshly uploaded data, and L2 cleanup suite (which only tracks `state.createdBackupIds` from the current run) would miss them. The seed endpoint deletes ALL backups for the test project before proceeding. R2 deletion uses `Promise.allSettled` (best-effort) — a missing R2 object is harmless, but a stale D1 row causes visible test pollution.
- **Full baseline reset, not partial repair** — The previous version only checked name + token. But E2E suites depend on the project being in a clean default state: `allowed_ips: null` (webhook must accept any IP), `auto_backup_enabled: 0`, etc. A leftover `allowed_ips` from a prior test run would cause webhook POST to return 403, killing the entire suite. The seed now resets ALL mutable columns.
- **Narrow endpoint, zero user input** — All values come from the shared `TEST_PROJECT` constant. No SQL injection surface.
- **Response includes actual values** — `projectId` and `webhookToken` are returned for logging/debugging visibility.
- **Single source of truth** — `src/lib/test-project.ts` is imported by both the server endpoint and `e2e/api/config.ts`. No duplicate hardcoded values, no drift risk.
- **Gated by `E2E_SKIP_AUTH=true`** — Returns 403 in production. Also unreachable via proxy (307 redirect to /login).

**Verification:**
1. `bun run test:e2e:api` — all 146 tests pass against test D1 + R2
2. `wrangler d1 execute backy-db-test --command "SELECT id, name, webhook_token, allowed_ips FROM projects"` — shows baseline state
3. Production D1 unaffected — `wrangler d1 execute backy-db --command "SELECT count(*) FROM projects"` shows unchanged count
4. Dev server auth gate — `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:7017/api/db/seed-test-project` returns 307 (proxy redirects unauthenticated requests to /login; confirms seed endpoint is not publicly accessible on a non-E2E dev server. On Railway production, `E2E_SKIP_AUTH` is also unset, so the route handler itself would return 403 as a second layer)
5. Dirty data test: `wrangler d1 execute backy-db-test --command "UPDATE projects SET allowed_ips = '10.0.0.0/8' WHERE id = 'mnp039joh6yiala5UY0Hh'"` → run E2E → seed reports "reset" → all tests pass
6. Orphan cleanup test: `wrangler d1 execute backy-db-test --command "INSERT INTO backups (id, project_id, r2_key, file_name, file_type, file_size, created_at) VALUES ('orphan-test', 'mnp039joh6yiala5UY0Hh', 'fake/key', 'orphan.txt', 'text/plain', 1, datetime('now'))"` → run E2E → seed log shows "cleaned 1 orphaned backups" → `SELECT count(*) FROM backups WHERE id = 'orphan-test'` returns 0

---

### Commit 5: `feat: wire L3 BDD E2E runner to use test resources`

**Files:**
- `e2e/bdd/runner.ts` — same pattern as L2:
  ```typescript
  import { loadTestEnv } from "../../scripts/load-env-test";
  import { seedTestProject } from "../api/config";
  // ...
  const testEnv = loadTestEnv();
  const server = spawn("bun", ["next", "dev", "--port", String(BDD_PORT)], {
    env: { ...testEnv, E2E_SKIP_AUTH: "true" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  ```
  Add schema init + seed after server ready (BDD specs depend on `backy-test` project existing):
  ```typescript
  // Initialize test database schema
  console.log("🗄️  Initializing test database schema...");
  await fetch(`${baseUrl}/api/db/init`, { method: "POST" });

  // Seed backy-test project — BDD specs assert its presence on /projects page
  console.log("🌱 Seeding test project...");
  await seedTestProject(baseUrl);
  ```

**Why seed is required for L3:**
BDD specs (e.g. `02-projects.spec.ts`) navigate to `/projects` and assert `page.getByText("backy-test").toBeVisible()`. On a fresh test database without seed, these assertions would timeout and fail.

**Verification:** `bun run test:e2e:bdd` — 5 specs pass against test resources.

---

### Phase C: Documentation

### Commit 6: `docs: update CLAUDE.md and README.md for test resource isolation`

**Files:**
- `CLAUDE.md` — add section after "Port Convention":

  ```markdown
  ### Test Resource Isolation

  E2E tests (L2 + L3) use **dedicated Cloudflare resources**, never production:

  | Resource | Production | Test (E2E) |
  |---|---|---|
  | D1 database | `backy-db` | `backy-db-test` |
  | R2 bucket | `backy` | `backy-test` |

  **Mechanism:** `.env.test` overrides `D1_DATABASE_ID` and `R2_BUCKET_NAME`. E2E runners load this file via `scripts/load-env-test.ts` (three-layer safety: file exists → required keys present → values ≠ production) and pass the merged env to child dev servers.

  **Seed:** `POST /api/db/seed-test-project` ensures the `backy-test` project exists with correct baseline state (name, token, all optional fields reset). Gated by `E2E_SKIP_AUTH`.

  **Naming convention:** `<product>-db` / `<product>-db-test` for D1, `<product>` / `<product>-test` for R2.
  ```

- `README.md` — update the E2E description paragraph (line ~280):

  Replace:
  ```
  E2E 测试使用 `backy-test` 项目自举：上传真实数据 → 验证完整流程 → 清理。通过 `E2E_SKIP_AUTH=true` 在本地绕过 OAuth。
  ```
  With:
  ```
  E2E 测试使用独立的测试 D1 (`backy-db-test`) 和 R2 (`backy-test`)，通过 `.env.test` 覆盖生产凭据，确保测试不影响生产数据。测试项目 `backy-test` 由 seed 端点自动创建和维护。通过 `E2E_SKIP_AUTH=true` 在本地绕过 OAuth。
  ```

**Verification:** CLAUDE.md and README.md reflect the new isolation architecture. No document still claims E2E hits production resources.

---

### Phase D: Cleanup (after 48h verification)

### Manual: delete old D1 database

```bash
# Only after confirming production + dev + E2E all work on new databases
wrangler d1 delete backy

# Clean up export file
rm backy-export.sql
```

---

## Rollback Plan

### Phase A rollback (D1 rename):
- Revert `.env` to old UUID (`a5bdd8e1-1a2d-41e0-bc7c-ff533fb5e49c`)
- Revert Railway env var to old UUID
- Old `backy` database is kept for 48h as safety net

### Phase B rollback (test isolation):
- Revert commits 2-5 — runners go back to `...process.env` (tests hit production again, unsafe but functional)
- Delete test resources:
  ```bash
  wrangler d1 delete backy-db-test
  wrangler r2 bucket delete backy-test
  ```

### Phase C rollback:
- Documentation only, no runtime impact

## Verification Checklist

After all commits:

- [ ] `wrangler d1 list` — shows `backy-db` and `backy-db-test` (old `backy` still exists during 48h grace period)
- [ ] `wrangler r2 bucket list` — shows `backy` and `backy-test`
- [ ] `.env` has new `backy-db` UUID for `D1_DATABASE_ID`
- [ ] `.env.test` exists with `backy-db-test` UUID and `R2_BUCKET_NAME=backy-test`
- [ ] D1 migration: ALL 5 tables (projects, backups, categories, webhook_logs, cron_logs) row counts match
- [ ] `bun dev` — dashboard loads, data intact (from `backy-db`)
- [ ] `curl https://your-domain.example.com/api/live` — production healthy (after Railway env update)
- [ ] `bun run test:e2e:api` — 146 tests pass (against test resources)
- [ ] `bun run test:e2e:bdd` — 5 specs pass (against test resources, seed creates `backy-test` project)
- [ ] Production D1 unchanged — row counts match pre-migration snapshot
- [ ] Production R2 unchanged — no new test objects in `backy` bucket
- [ ] Removing `.env.test` causes E2E runner to hard-fail with clear message
- [ ] `.env.test` with production `D1_DATABASE_ID` causes E2E runner to hard-fail with "identical to production" error
- [ ] `.env.test` with production `R2_BUCKET_NAME=backy` causes E2E runner to hard-fail with "identical to production" error
- [ ] Dev server auth gate: `curl -X POST http://localhost:7017/api/db/seed-test-project` returns 307 redirect (proxy blocks unauthenticated access; on Railway production `E2E_SKIP_AUTH` is unset so route itself also returns 403)
- [ ] Dirty data test: set `allowed_ips = '10.0.0.0/8'` on test project → seed reports "reset" → all fields back to baseline → E2E passes
- [ ] Orphan cleanup test: manually insert a fake backup row for the test project in `backy-db-test` → run E2E → seed log shows "cleaned 1 orphaned backups" → row no longer in D1
- [ ] `bun run test:coverage` — L1 unaffected, 486+ tests pass
- [ ] CLAUDE.md documents test isolation and naming convention

## Known Limitations (Out of Scope)

These are **pre-existing E2E test quality issues**, not resource isolation issues. They exist in the current (non-isolated) setup and will continue to exist after isolation. Tracked here for visibility.

1. **BDD specs skip on empty backup data** — `03-backup-detail.spec.ts` and `05-navigation-restore.spec.ts` use `test.skip()` when no backup links are visible. On a fresh test DB with only the seeded project (no backups), these specs pass without actually exercising the backup read/detail/restore chain. The pre-run cleanup (which deletes orphaned backups) makes this more likely on the first BDD run after seed. **Mitigation in this plan:** The L2 API E2E runs first (via pre-push hook, parallel with G2) and creates real backups via webhook. If L3 BDD runs after L2 without a fresh seed in between, backups exist. For on-demand L3 runs on a clean DB, the skip behavior is acceptable — the L2 suite already validates the full backup CRUD chain at the API level.

2. **`04-manual-upload.spec.ts` doesn't assert persistence** — After uploading a file, the spec only calls `waitForTimeout(2000)` and does not verify the backup appears in the list or is accessible. This is a spec quality issue, not an isolation issue.

**Recommendation:** Address both in a future E2E test quality improvement pass (separate from this isolation plan). Potential fixes include: (a) adding a webhook-uploaded "fixture backup" step to the L3 runner startup, (b) making the upload spec assert that the backup appears after upload.
