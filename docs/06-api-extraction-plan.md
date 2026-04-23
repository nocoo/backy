# 06 — API Extraction Plan (Wave-by-Wave)

> Goal: extract pure server logic out of `apps/web` into `@backy/api` so the
> Next.js layer becomes a thin HTTP adapter. This unblocks replacing Next.js
> with Vite + a separate router/worker (mirroring `../surety`'s
> `web (Vite SPA) → worker (Hono) → api (logic) → db` topology).
>
> Reference: `../surety/packages/api`, `../surety/apps/worker`,
> `../surety/apps/web`.

## Status legend

- ⬜ pending
- 🟡 in progress
- ✅ done

---

## Target architecture (end state)

```
packages/api/                 # @backy/api — framework-agnostic
  src/
    lib/                      # pure utilities, DB clients, R2, backup logic
      db/{d1-client,projects,backups,categories,cron-logs,webhook-logs,schema}.ts
      r2/client.ts
      backup/{file-type,storage,extractors}.ts
      {id,hosts,ip,sanitize,url,test-project}.ts
    handlers/                 # business logic, returns HandlerResponse
      projects.ts             # list, create, get, update, remove, regenerateToken, prompt
      backups.ts              # list, batchDelete, get, remove, upload, download, preview, extract, restoreCommand
      categories.ts           # list, create, get, update, remove
      cron.ts                 # trigger, triggerProject, listLogs, deleteLogs
      webhook.ts              # verify (HEAD), status (GET), ingest (POST)
      restore.ts              # get
      logs.ts                 # list, remove
      stats.ts                # totals, charts
      live.ts                 # check
      db.ts                   # init, seedTestProject
      ipInfo.ts               # lookup
      http.ts                 # HandlerResponse type + json/empty/bytes/text constructors
    index.ts                  # selective re-exports

apps/web/                     # @backy/web — Next.js host (will become Vite SPA)
  src/
    lib/
      utils.ts                # cn() — UI only
      category-icons.ts       # lucide icons — UI only
      version.ts              # web-package version
      http.ts                 # NEW: Request ↔ HandlerResponse (json/bytes/empty/text) adapter
    app/api/**/route.ts       # 4–6 line wrappers calling handlers via http.ts
    app/**/page.tsx           # unchanged
    components/, hooks/       # unchanged
```

After all waves, replacing Next.js means: rewrite the routes (probably as
Hono routes in a new `apps/worker`), migrate `app/page.tsx` etc. into a Vite
SPA. **Zero handler/lib code is touched in that future migration.**

---

## Why three waves (not one)

A single mega-commit would be unreviewable and would leave a long window of
broken imports. Three atomic waves, each green at the end:

1. **Lib relocation + gate wiring** — moves files, keeps behavior, but
   also declares the workspace dependency, rewrites intra-api imports,
   splits the test helper, and extends root gates to the new workspace.
   Everything listed in "Prerequisites" below is **part of this commit**,
   not pre-work.
2. **Handler extraction** — removes Next imports from business logic.
3. **HTTP adapter shim** — collapses route boilerplate to one helper.

Each wave passes G1 + L1 + L2 before commit. (Wave 1 has no behavior
change but L2 is still run as a regression check — see wave-1 acceptance.)

---

## Wave 1 — Relocate server libs to `@backy/api`  ✅

### Scope

Move these files **with `git mv`** (preserve rename detection):

| From `apps/web/src/lib/` | To `packages/api/src/lib/` |
|---|---|
| `db/{d1-client,projects,backups,categories,cron-logs,webhook-logs,schema}.ts` | `db/...` |
| `r2/client.ts` | `r2/client.ts` |
| `backup/{file-type,storage,extractors}.ts` | `backup/...` |
| `id.ts`, `hosts.ts`, `ip.ts`, `sanitize.ts`, `url.ts`, `test-project.ts` | (root of `lib/`) |

Move associated tests **with `git mv`** to `packages/api/src/__tests__/`:

| Test file | Notes |
|---|---|
| `id.test.ts`, `hosts.test.ts`, `ip.test.ts`, `sanitize.test.ts`, `url.test.ts` | pure |
| `d1-client.test.ts` | pure |
| `categories.test.ts`, `cron-logs.test.ts`, `webhook-logs.test.ts` | DB modules |
| `file-type.test.ts`, `storage.test.ts`, `extractors.test.ts` | backup modules |

Tests that exercise route handlers (`*-route.test.ts`, `webhook.test.ts`,
`upload.test.ts`, `cron-trigger.test.ts`, `manual-trigger.test.ts`,
`extract-route.test.ts`, `restore.test.ts`, `health.test.ts`,
`stats-route.test.ts`, `charts.test.ts`, `proxy.test.ts`,
`ip-info.test.ts`, `categories-api.test.ts`) **stay in `apps/web`** for
wave 1 — they still import the route. Their `@/lib/*` imports flip to
`@backy/api/...` in this commit.

UI-only modules **stay in `apps/web/src/lib/`**:
- `utils.ts` — `cn()` (clsx + tailwind-merge)
- `category-icons.ts` — lucide-react components
- `version.ts` — reads `apps/web/package.json`

### Prerequisites (before moving any file)

These are the missing steps from an earlier draft. Do them **inside the same
commit** as the relocation; the commit stays green only if all are present.

1. **Declare `@backy/api` as an `apps/web` dependency.** Without this, Bun's
   workspace resolution doesn't create the symlink and imports resolve
   nowhere. Add to `apps/web/package.json`:
   ```json
   "dependencies": {
     "@backy/api": "workspace:*",
     ...existing
   }
   ```
   Re-run `bun install` after the edit so `apps/web/node_modules/@backy/api`
   symlinks into `packages/api`.

2. **Rewrite `@/lib/*` imports *inside* the relocated files** (they move
   into `packages/api`, so `@/*` no longer resolves there). Convert them
   to relative imports within `packages/api/src/lib/`:

   | File | Import to rewrite |
   |---|---|
   | `lib/sanitize.ts` | `@/lib/db/projects` → `./db/projects` |
   | `lib/db/projects.ts` | `@/lib/id` → `../id` |
   | `lib/db/backups.ts` | `@/lib/id` → `../id` |
   | `lib/db/categories.ts` | `@/lib/id` → `../id` |
   | `lib/db/cron-logs.ts` | `@/lib/id` → `../id` |
   | `lib/db/webhook-logs.ts` | `@/lib/id` → `../id` |
   | `lib/url.ts` | `@/lib/ip` → `./ip` |

   (Run `grep -n "@/lib/" packages/api/src` after the move; must be empty.)

3. **Relocate or split the shared test helper.** `apps/web/src/__tests__/helpers.ts`
   is imported by both pure-lib tests (`sanitize.test.ts`,
   `extractors.test.ts`, `d1-client.test.ts`, …) that move to
   `packages/api`, and by route tests that stay in `apps/web`. Plan:

   - Split it: keep web-specific helpers (route/Request builders, NextAuth
     stubs) in `apps/web/src/__tests__/helpers.ts`; move the pure-lib
     helpers (fetch mock, D1 success/error builders, nanoid stubs) into
     `packages/api/src/__tests__/helpers.ts`.
   - Both files are independent; neither imports the other.
   - If splitting is impractical during the move, the initial pass may
     **duplicate** the file (copy into `packages/api`) and immediately
     remove web-only helpers from the api copy and api-only helpers from
     the web copy. Flag the duplication as a TODO only if strictly
     necessary — prefer a clean split.

   Run `grep -rn "from \"@/__tests__\|from \"../../__tests__\|helpers\"" packages/api/src` after — should only match the new relative import.

4. **Verify resolution before moving on:** `bun --cwd apps/web -e "import('@backy/api/id')"` must succeed; tsc must pass on both workspaces.

### `packages/api/package.json` changes

Add deps that the moved code uses (no devDeps beyond Bun + TS + lint
tooling). `zod` is not used by wave-1 files, but is declared now because
wave-2 handlers will import it — declaring it here avoids touching the
manifest a second time and keeps G2 scan surface stable across waves.

```json
{
  "name": "@backy/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".":               "./src/index.ts",
    "./db/d1-client":  "./src/lib/db/d1-client.ts",
    "./db/projects":   "./src/lib/db/projects.ts",
    "./db/backups":    "./src/lib/db/backups.ts",
    "./db/categories": "./src/lib/db/categories.ts",
    "./db/cron-logs":  "./src/lib/db/cron-logs.ts",
    "./db/webhook-logs": "./src/lib/db/webhook-logs.ts",
    "./db/schema":     "./src/lib/db/schema.ts",
    "./r2":            "./src/lib/r2/client.ts",
    "./backup/file-type": "./src/lib/backup/file-type.ts",
    "./backup/storage":   "./src/lib/backup/storage.ts",
    "./backup/extractors":"./src/lib/backup/extractors.ts",
    "./id":            "./src/lib/id.ts",
    "./hosts":         "./src/lib/hosts.ts",
    "./ip":            "./src/lib/ip.ts",
    "./sanitize":      "./src/lib/sanitize.ts",
    "./url":           "./src/lib/url.ts",
    "./test-project":  "./src/lib/test-project.ts"
  },
  "dependencies": {
    "@aws-sdk/client-s3":          "^3.1014.0",
    "@aws-sdk/s3-request-presigner":"^3.1014.0",
    "jszip":                        "^3.10.1",
    "nanoid":                       "^5.1.7",
    "tar-stream":                   "^3.1.8",
    "zod":                          "^4.3.6"
  },
  "devDependencies": {
    "@types/bun":         "^1.3.11",
    "@types/tar-stream":  "^3.1.4",
    "eslint":             "^9.39.4",
    "lint-staged":        "^16.4.0",
    "typescript":         "^5.9.3",
    "typescript-eslint":  "8.56.0"
  },
  "scripts": {
    "lint":          "eslint --max-warnings=0 src",
    "lint:staged":   "lint-staged",
    "test":          "bun test src/__tests__/",
    "test:coverage": "bun run scripts/check-coverage.ts",
    "typecheck":     "tsc --noEmit"
  },
  "lint-staged": {
    "*.ts": "eslint --max-warnings=0"
  }
}
```

This is the **single source of truth** for `packages/api/package.json`
after wave 1 — the lint scripts/devDeps/lint-staged config are all
included so a reader who copies this JSON gets a manifest that already
satisfies the gate-wiring step in "Coverage gate plumbing" below.

The same deps remain in `apps/web/package.json` for now (unused there after
wave 1 but harmless until a follow-up cleanup); transitively resolved via
the workspace symlink. **Out of scope for this wave**: removing the
duplicates from `apps/web`.

### Coverage gate plumbing

All quality gates must run across both workspaces after wave 1. Current
state: root scripts and husky hooks only exercise `apps/web`.

**Changes required in the wave-1 commit:**

1. Add `packages/api/scripts/check-coverage.ts` — copy of apps/web's,
   threshold 90%.
2. `packages/api/package.json` already includes the `lint`, `lint:staged`,
   `test:coverage`, `typecheck`, `test` scripts and the
   `eslint`/`typescript-eslint`/`lint-staged` devDeps + the `lint-staged`
   config (see the JSON above — that JSON is the source of truth, this
   step is just the reminder that those entries land via wave 1).
3. Root `package.json` fans out:
   ```json
   "lint":          "bun --cwd apps/web lint && bun --cwd packages/api lint",
   "lint:staged":   "bun --cwd apps/web lint:staged && bun --cwd packages/api lint:staged",
   "typecheck":     "bun --cwd apps/web typecheck && bun --cwd packages/api typecheck && bun --cwd apps/cli typecheck",
   "test":          "bun --cwd apps/web test && bun --cwd packages/api test && bun --cwd apps/cli test",
   "test:coverage": "bun --cwd packages/api test:coverage && bun --cwd apps/web test:coverage"
   ```
5. `.husky/pre-commit` stays unchanged (calls root `typecheck` +
   `lint:staged` + `test:coverage`); after step 3 it transparently covers
   the new workspace.
6. Confirm: `bun run lint`, `bun run typecheck`, `bun run test:coverage`
   all exercise `packages/api` and pass.

`packages/api/eslint.config.mjs` is a slimmed-down flat config: tseslint
strict only, no Next plugin, no React/JSX. Test files override to allow
non-null assertions.

### Import rewrites

Across `apps/web/src/`, every `@/lib/<x>` import becomes `@backy/api/<x>`
**only for the relocated modules**. UI modules keep `@/lib/*`:

| Stays `@/lib/*` | Becomes `@backy/api/*` |
|---|---|
| `@/lib/utils` | `@/lib/db/projects` → `@backy/api/db/projects` |
| `@/lib/category-icons` | `@/lib/r2/client` → `@backy/api/r2` |
| `@/lib/version` | `@/lib/id` → `@backy/api/id`, etc. |

`apps/web/tsconfig.json` keeps `"@/*": ["./src/*"]` (still needed for
remaining UI libs and components). No path-alias change needed.

### ESLint

`packages/api/eslint.config.mjs`: minimal, extends only tseslint strict.
No Next plugin. Files under `__tests__/` allow non-null assertions.

### Acceptance criteria for the commit

- `bun --cwd apps/web -e "import('@backy/api/id')"` resolves successfully
- `grep -rn "@/lib/" packages/api/src` is empty
- `bun --cwd packages/api typecheck` passes
- `bun --cwd packages/api lint` passes with 0 warnings
- `bun --cwd packages/api test:coverage` passes (≥90% on relocated lib)
- `bun --cwd apps/web typecheck` passes
- `bun --cwd apps/web test:coverage` passes (≥90% on what's left)
- Root `bun run typecheck`, `bun run lint`, `bun run test:coverage` all
  exercise both workspaces and pass
- `bun run gate:security` clean (no new vulns from added deps)
- L2 (`bun run test:e2e:api`) 146/146 pass — wave-1 has no behavior
  change so this must not regress

### Commit message

```
refactor: extract server libs into @backy/api

Move db, r2, backup, id, hosts, ip, sanitize, url, test-project
from apps/web/src/lib to packages/api/src/lib with subpath exports.
Tests for these modules move alongside; route tests stay in apps/web.

apps/web becomes a consumer via @backy/api/<subpath>. UI-only libs
(utils, category-icons, version) stay in apps/web.
```

### Status: ✅

Verified: `bun --cwd packages/api {typecheck,lint,test:coverage}` →
278 tests, 93.74% func / 95.24% line. `bun --cwd apps/web
{typecheck,lint,test:coverage}` → 256 tests, 90.68% func / 91.47% line.

---

## Wave 2 — Extract handlers to `@backy/api/handlers`  🟡 (2a ✅, 2b ✅, 2c ✅, 2d.1 ✅, 2d.2 ✅, 2d.3 ✅, 2d.4 ⬜)

### Scope

Each route file in `apps/web/src/app/api/**/route.ts` gets its business logic
extracted into a corresponding handler in `packages/api/src/handlers/`.

**Handler signature contract** (framework-agnostic, discriminated union):

```ts
export type HandlerResponse =
  | { kind: "json";  status: number; body: unknown;   headers?: Record<string, string> }
  | { kind: "bytes"; status: number; bytes: Uint8Array; contentType: string; headers?: Record<string, string> }
  | { kind: "empty"; status: number; headers?: Record<string, string> }
  | { kind: "text";  status: number; text: string;    contentType?: string; headers?: Record<string, string> };

// Constructors for ergonomic use in handlers:
export const json  = (status: number, body: unknown, headers?: Record<string, string>): HandlerResponse =>
  ({ kind: "json", status, body, ...(headers && { headers }) });
export const empty = (status: number, headers?: Record<string, string>): HandlerResponse =>
  ({ kind: "empty", status, ...(headers && { headers }) });
export const bytes = (status: number, data: Uint8Array, contentType: string, headers?: Record<string, string>): HandlerResponse =>
  ({ kind: "bytes", status, bytes: data, contentType, ...(headers && { headers }) });
```

The `"empty"` branch covers the HEAD `/api/webhook/[projectId]` case (200
with only `X-Project-Name`, no body — `apps/web/src/app/api/webhook/[projectId]/route.ts:84`)
and the 204 responses from `DELETE /api/cron/logs` and `DELETE /api/logs`.

**Example shapes**
```ts
// Example shapes
export async function listProjectsHandler(): Promise<HandlerResponse>;

export async function createProjectHandler(input: {
  body: unknown;
}): Promise<HandlerResponse>;

export async function uploadBackupHandler(input: {
  formData: FormData;
}): Promise<HandlerResponse>;

export async function webhookPostHandler(input: {
  projectId: string;
  authHeader: string | null;
  formData: FormData;
  clientIp: string;          // x-forwarded-for resolution stays in adapter
}): Promise<HandlerResponse>;
```

**Rules**:
- No `NextResponse`, no `next/server`, no `Request` web type in handler
  signatures (only as a transport for bytes if absolutely necessary —
  prefer extracting `formData`, headers, query in the adapter).
- Handlers throw or return `{status, body}` for errors. No `console.error`
  with framework wording — use plain `throw` and let the adapter log.
- Handlers receive plain values; framework concerns (cookies, sessions,
  Next 15 dynamic params) resolved in the adapter.
- `auth()` from NextAuth is **out of scope for wave 2** — auth checks stay
  in the route file as a guard around the handler call. Wave 4 (future)
  can introduce an `AuthContext` argument.

### File mapping (26 route files → 37 method handlers)

Verified against the current repo with
`grep -nE '^export (async )?function (GET|POST|PUT|DELETE|HEAD|PATCH)' apps/web/src/app/api/**/route.ts`.

| Route | Handler |
|---|---|
| `GET    /api/projects`              | `handlers/projects.list` |
| `POST   /api/projects`              | `handlers/projects.create` |
| `GET    /api/projects/[id]`         | `handlers/projects.get` |
| `PUT    /api/projects/[id]`         | `handlers/projects.update` |
| `DELETE /api/projects/[id]`         | `handlers/projects.remove` |
| `POST   /api/projects/[id]/token`   | `handlers/projects.regenerateToken` |
| `GET    /api/projects/[id]/prompt`  | `handlers/projects.prompt` |
| `GET    /api/backups`               | `handlers/backups.list` |
| `DELETE /api/backups`               | `handlers/backups.batchDelete` |
| `GET    /api/backups/[id]`          | `handlers/backups.get` |
| `DELETE /api/backups/[id]`          | `handlers/backups.remove` |
| `POST   /api/backups/upload`        | `handlers/backups.upload` |
| `GET    /api/backups/[id]/download` | `handlers/backups.download` |
| `GET    /api/backups/[id]/preview`  | `handlers/backups.preview` |
| **`POST**  `/api/backups/[id]/extract`** | `handlers/backups.extract` |
| `GET    /api/backups/[id]/restore-command` | `handlers/backups.restoreCommand` |
| `GET    /api/categories`            | `handlers/categories.list` |
| `POST   /api/categories`            | `handlers/categories.create` |
| **`GET    /api/categories/[id]`**   | `handlers/categories.get` |
| `PUT    /api/categories/[id]`       | `handlers/categories.update` |
| `DELETE /api/categories/[id]`       | `handlers/categories.remove` |
| `POST   /api/cron/trigger`          | `handlers/cron.trigger` |
| `POST   /api/cron/trigger/[projectId]` | `handlers/cron.triggerProject` |
| `GET    /api/cron/logs`             | `handlers/cron.listLogs` |
| **`DELETE /api/cron/logs`**         | `handlers/cron.deleteLogs` |
| `GET    /api/logs`                  | `handlers/logs.list` |
| `DELETE /api/logs`                  | `handlers/logs.remove` |
| `HEAD   /api/webhook/[projectId]`   | `handlers/webhook.verify` |
| `GET    /api/webhook/[projectId]`   | `handlers/webhook.status` |
| `POST   /api/webhook/[projectId]`   | `handlers/webhook.ingest` |
| `GET    /api/restore/[id]`          | `handlers/restore.get` |
| `GET    /api/stats`                 | `handlers/stats.totals` |
| `GET    /api/stats/charts`          | `handlers/stats.charts` |
| `GET    /api/live`                  | `handlers/live.check` |
| `GET    /api/ip-info`               | `handlers/ipInfo.lookup` |
| `POST   /api/db/init`               | `handlers/db.init` |
| `POST   /api/db/seed-test-project`  | `handlers/db.seedTestProject` |

Bold rows = corrections from the earlier draft (missing / wrong method).

Handlers are grouped by area (one file per area, multiple exports) per
decision D1 — see "Decisions (locked)" below.

### Test relocation in wave 2

For each handler extracted, the existing `*-route.test.ts` is split:
- **Pure handler tests** move to `packages/api/src/__tests__/handlers/`
  and test the handler directly (no Request wrapping).
- **Adapter glue tests** stay in `apps/web/src/__tests__/` and test that
  the route correctly forwards Request → handler input and
  HandlerResponse → Response.

To keep the diff manageable, wave 2 may be **subdivided into 4
sub-commits** (split by domain) if the diff exceeds ~3000 lines:

- 2a: handlers for projects + categories + db + ip-info + live + stats ✅
- 2b: handlers for backups (list, get, delete, upload) ✅
- 2c: handlers for backups/[id]/{download,preview,extract,restore-command} ⬜
- 2d: handlers for cron + webhook + restore + logs ⬜

Each sub-commit independently green (G1 + L1 + L2).

### Acceptance criteria

- All 26 routes call handler functions; route bodies are 4–8 lines
- `grep -r "next/server" packages/api/src` → empty
- `grep -r "NextResponse" packages/api/src` → empty
- L1 coverage ≥90% on both workspaces
- L2 (`bun run test:e2e:api`) 146/146 pass
- G1 + G2 clean

### Status: 🟡

**Wave 2a complete (2026-04-23):**
- Extracted 12 handlers (projects×7, categories×5, db×2, ip-info, live, stats×2)
- Added `packages/api/src/http/response.ts` (`HandlerResponse` discriminated union + constructors)
- Added `apps/web/src/lib/http.ts` adapter (`toResponse`)
- Routes rewritten as 4–10 line adapters (12 route files)
- New tests: 6 handler test files in `packages/api/src/__tests__/handlers/`, 1 http response test, 1 adapter test
- Verification: packages/api 356 tests / 95.48% funcs / 96.24% lines · apps/web 268 tests / 92.18% funcs / 96.82% lines · L2 e2e 146/146 · typecheck/lint clean
- Coverage script updated: `apps/web` aggregate now excludes `packages/api/...` rows (each workspace gates its own files)
- `apps/web/e2e/api/config.ts` switched to `@backy/api/test-project` import

**Wave 2b complete (2026-04-23):**
- Extracted 5 handlers (listBackups, batchDeleteBackups, getBackup, deleteBackup, uploadBackup)
- 3 routes rewritten as adapters (`/api/backups`, `/api/backups/[id]`, `/api/backups/upload`)
- New tests: 28 cases in `packages/api/src/__tests__/handlers/backups.test.ts`
- Verification: packages/api 384 tests / 95.66% funcs / 96.39% lines · apps/web 268 tests / 92.18% funcs / 95.74% lines · L2 e2e 146/146 · typecheck/lint clean

**Wave 2c complete (2026-04-23):**
- Extracted 4 handlers (downloadBackup, previewBackup, extractBackup, restoreCommand) appended to `packages/api/src/handlers/backups.ts`
- 4 routes rewritten as adapters (`/api/backups/[id]/{download,preview,extract,restore-command}`)
- New tests: 24 cases in `backups.test.ts` (downloads ×4, preview ×7, extract ×9, restore-command ×4); mocks extended to inject `downloadFromR2`/`createPresignedDownloadUrl`/`updateBackup`
- Verification: packages/api 408 tests / 95.66% funcs / 96.39% lines · apps/web 268 tests / 92.18% funcs / 96.02% lines · L2 e2e 146/146 · typecheck clean

**Wave 2d.2 complete (2026-04-23):**
- Extracted `cronTriggerHandler` + `cronTriggerOneHandler` into `packages/api/src/handlers/cron.ts` (148 LOC); shared `fireProjectWebhook` + `logFireAndForget` between the two
- 2 routes rewritten as adapters (`/api/cron/trigger`, `/api/cron/trigger/[projectId]`)
- New tests: 20 cases in `cron.test.ts` covering auth, SSRF static + DNS blocks, fetch outcomes (success/non-2xx/throw)
- Mock-pollution gotcha: `import * as realUrl` then re-using `realUrl.isUrlSafe` inside the `mock.module("../../lib/url", ...)` factory creates infinite recursion (the spread re-reads the now-mocked binding). Fix: capture `realIsUrlSafe`/`realResolveAndValidateUrl` as constants BEFORE `mock.module` runs, and do not spread the original module
- Verification: packages/api 443 tests / 95.19% funcs / 96.54% lines · apps/web 268 tests / 97.18% funcs / 96.90% lines · L2 e2e 146/146 · typecheck + lint clean

**Wave 2d.3 complete (2026-04-23):**
- Extracted `restoreHandler` into `packages/api/src/handlers/restore.ts` (54 LOC); IP enforcement folded into the handler with `clientIp` passed in (no `Request` dependency)
- 1 route rewritten as adapter (`/api/restore/[id]`); adapter calls `getClientIp(request)` and forwards `authorization` + `clientIp` as primitives
- New tests: 10 cases in `restore.test.ts` covering missing/invalid auth, missing backup/project, token mismatch, IP CIDR allow + deny + null-with-restriction, success, db error
- Verification: packages/api 453 tests / 95.36% funcs / 96.67% lines · apps/web 268 tests / 97.18% funcs / 97.32% lines · L2 e2e 146/146 · typecheck + lint clean

---

## Wave 3 — HTTP adapter shim in `apps/web`  ⬜

### Scope

Add `apps/web/src/lib/http.ts`:

```ts
import { NextResponse } from "next/server";
import type { HandlerResponse } from "@backy/api";

export function toResponse(r: HandlerResponse): Response {
  switch (r.kind) {
    case "empty":
      return new Response(null, { status: r.status, headers: r.headers });
    case "bytes":
      return new Response(r.bytes, {
        status: r.status,
        headers: { "content-type": r.contentType, ...r.headers },
      });
    case "text":
      return new Response(r.text, {
        status: r.status,
        headers: { "content-type": r.contentType ?? "text/plain; charset=utf-8", ...r.headers },
      });
    case "json":
      return NextResponse.json(r.body, { status: r.status, headers: r.headers });
  }
}

export function withErrors<TIn>(
  fn: (input: TIn) => Promise<HandlerResponse>,
  label: string,
): (input: TIn) => Promise<Response> {
  return async (input) => {
    try {
      return toResponse(await fn(input));
    } catch (err) {
      console.error(`[${label}]`, err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
```

Routes collapse to:

```ts
// apps/web/src/app/api/projects/route.ts
import { listProjectsHandler, createProjectHandler } from "@backy/api";
import { withErrors } from "@/lib/http";

export const GET  = withErrors(() => listProjectsHandler(), "projects.list");
export const POST = withErrors(
  async (req: Request) => createProjectHandler({ body: await req.json() }),
  "projects.create",
);
```

### Acceptance criteria

- `grep -rn "NextResponse\|next/server" apps/web/src/app/api` returns
  imports only in `lib/http.ts` and the NextAuth catch-all route
- All 26 route files ≤10 lines
- L1 + L2 + G1 + G2 all green
- L3 Playwright suite (5 specs) optional spot-check

### Status: ⬜

---

## Out of scope (future waves)

| Future wave | Description |
|---|---|
| W4 | NextAuth abstraction — define `AuthContext`, push session resolution into adapter |
| W5 | `apps/cli` real implementation — consumes `@backy/api` directly (no HTTP) |
| W6 | `apps/worker` (Hono on Cloudflare) — alternative HTTP adapter |
| W7 | `apps/web` migration to Vite + react-router (kills Next.js) |
| W8 | Remove `@aws-sdk/*`, `jszip`, `tar-stream`, `nanoid` from `apps/web/package.json` |
| W9 | `apps/web/scripts/release.ts` PROJECT_ROOT fix to point at git root |

---

## Decisions (previously open questions, now locked)

1. **Handler granularity** — group by area, one file per logical area
   exporting multiple functions (mirrors surety). See the `handlers/` tree
   in "Target architecture" above.

2. **Wave 2 subdivision** — 4 sub-commits (2a/2b/2c/2d), each ~700 LOC,
   each independently green. See "Wave 2 — Extract handlers" above.

3. **HandlerResponse shape** — discriminated union with `kind: "json" |
   "bytes" | "empty" | "text"`. Rationale: the bodyless branch
   (HEAD `/api/webhook/*`, 204 DELETEs on `/api/cron/logs` and `/api/logs`)
   cannot be safely represented by an optional-body shape. See
   "Handler signature contract" above.

4. **Coverage gate per workspace** — separate ≥90% gates per workspace,
   aggregated by a root script fan-out. See "Coverage gate plumbing" above.

5. **`packages/api` ESLint config** — standalone flat config, tseslint
   strict only, no Next plugin, no React/JSX. See "Coverage gate plumbing"
   above.
