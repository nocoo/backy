# Backy

AI backup management service. Receive, store, preview, and restore backups sent by SaaS AI agents via webhooks.

## Tech Stack

| Component | Choice |
|---|---|
| Runtime | Bun (local) + Cloudflare Workers (production) |
| Frontend | Vite 7 + React 19 + react-router v7 (SPA) |
| Backend | Hono on Cloudflare Workers |
| Language | TypeScript (strict mode) |
| UI | Tailwind CSS v4 + shadcn/ui (basalt design system) |
| Charts | Recharts |
| Validation | Zod v4 |
| Auth | Cloudflare Access (JWT, nocoo team) |
| Metadata DB | Cloudflare D1 (Workers binding) |
| File Storage | Cloudflare R2 (Workers binding) |
| Deployment | `wrangler deploy` (Cloudflare Workers) |
| Domain | your-domain.example.com |

## Project Structure

This is a **Bun monorepo** (`workspaces: ["apps/*", "packages/*"]`).

```
apps/
  web/                     # @backy/web — Vite + React 19 SPA (production frontend)
  worker/                  # @backy/worker — Hono on Cloudflare Workers (API + cron + assets host)
  web_legacy/              # @backy/web-legacy — frozen Next.js snapshot (deletion pending)
  cli/                     # @backy/cli — placeholder, AI-facing CLI (next wave)
packages/
  api/                     # @backy/api — shared business logic (handlers, lib, runtime context)
scripts/
  gate-security.ts         # G2 security gate (osv-scanner + gitleaks)
  release.ts               # Version bump + CHANGELOG + GitHub release
osv-scanner.toml           # G2 osv-scanner config
.gitleaks.toml             # G2 gitleaks config
```

The root `package.json` fans out to `apps/web`, `apps/worker`,
`packages/api`, and `apps/cli` for `lint` / `typecheck` / `test` /
`test:coverage`. `dev` runs `wrangler dev` (port 7018) and `vite dev`
(port 7019) in parallel; vite proxies `/api/*` to the worker. `build`
runs `vite build` which writes the SPA bundle into `apps/worker/static/`
(gitignored) so `wrangler deploy` ships frontend + API in one Worker.

`apps/web_legacy` is no longer touched by `bun dev` / `bun test` /
`bun run gate:security`; it's reachable only via `legacy:*` aliases
(`legacy:dev`, `legacy:test:coverage`, `legacy:test:e2e:api`, etc.) and
can be deleted whenever its history isn't needed for reference.

The new web workspace:

```
apps/web/
  src/
    pages/                 # dashboard / projects(+new+detail) / backups(+detail) / logs / cron-logs
    components/
      charts/              # recharts wrappers (activity, cron, project)
      layout/              # app-shell, sidebar, theme toggle, breadcrumbs
      ui/                  # shadcn/ui primitives (cn helper, badges, dialogs, …)
    hooks/                 # useIsMobile etc.
    lib/                   # api fetcher (swrFetcher), formatters, utils
    __tests__/             # bun test + happy-dom (api/auth/backups/charts/dashboard/layout/logs/projects/scaffold/ui)
    App.tsx                # react-router routes
    AppLayout.tsx          # shell wrapper
    main.tsx               # vite entry
  vite.config.ts           # outDir: ../worker/static, proxy /api → :7018
  scripts/check-coverage.ts
```

The new worker workspace:

```
apps/worker/
  src/
    routes/                # backups / categories / cron / db / ip-info / live / logs / me / projects / restore / stats / webhook
    middleware/            # accessAuth (CF Access JWT), ctx (D1/R2 bindings → RuntimeContext)
    lib/                   # is-localhost, handler-response adapter
    __tests__/             # bun test (access-auth, ctx, handler-response, is-localhost, routes)
    index.ts               # Hono app + scheduled() cron handler
  static/                  # vite build output drops here (gitignored, served via [assets] binding)
  wrangler.toml            # name, compatibility_date, D1/R2 bindings, [env.test], cron triggers
  scripts/check-coverage.ts
```

Shared business logic:

```
packages/api/
  src/
    handlers/              # backups, projects, logs, stats, webhook, restore, etc.
    lib/                   # runtime context (D1/R2/env), id generation, sanitize, hosts, ip
    __tests__/             # bun test
```

## Quality System (3 Test Layers + 2 Gates)

| Layer | Tool | Script | Trigger | Requirement |
|---|---|---|---|---|
| L1 Unit | bun test | `bun run test:coverage` | pre-commit | 90%+ coverage on `src/lib/**` |
| L2 Integration/API | (legacy only) | `bun run legacy:test:e2e:api` | on-demand | 146 tests, returns to root with Wave B' |
| L3 System/E2E | Playwright (legacy only) | `bun run legacy:test:e2e:bdd` | on-demand | 5 specs, returns with Wave B' |
| G1 Static Analysis | tsc + ESLint | `bun run typecheck && bun run lint:staged` | pre-commit | 0 errors, 0 warnings (`--max-warnings 0`) |
| G2 Security | osv-scanner + gitleaks | `bun run gate:security` | pre-push | 0 vulnerabilities, 0 leaked secrets, hard fail if tool missing |

### Hooks Mapping

| Hook | Budget | Runs |
|---|---|---|
| pre-commit | <30s | G1 → L1 (sequential) |
| pre-push | <30s | G2 |
| on-demand | — | legacy L2 / L3 |

### Port Convention

| Purpose | Port |
|---|---|
| Vite dev server | 7019 |
| Wrangler dev (worker) | 7018 |
| Legacy Next.js dev | 7017 |
| Legacy L2 API E2E | 17017 |
| Legacy L3 BDD E2E | 27017 |

### Core Principles

1. **Catch early** — no accumulating tech debt
2. **Self-resolve** — no relying on manual review for basic errors
3. **Quality gate** — bad code cannot enter main branch

## Common Commands

All commands run from the repo root.

```bash
bun dev                    # wrangler dev (7018) + vite (7019) in parallel
bun run build              # vite build → apps/worker/static/
bun run worker:deploy      # wrangler deploy
bun test                   # all workspaces (web + worker + api + cli)
bun run test:coverage      # web + worker + api with 90% gate
bun run typecheck          # tsc --noEmit across all workspaces
bun run lint               # ESLint across all workspaces
bun run lint:staged        # ESLint on staged files (per-workspace lint-staged)
bun run gate:security      # osv-scanner + gitleaks (root configs)
bun run release            # bump version + CHANGELOG + GitHub release
bun run legacy:dev         # legacy Next.js (port 7017) — deletion pending
bun run legacy:test:e2e:api  # legacy L2 (port 17017) — until Wave B' rebuilds on worker
```

## Test Resource Isolation

E2E tests (legacy L2 + L3) use **dedicated Cloudflare D1 + R2** to prevent production data corruption.

| Resource | Production | Test |
|---|---|---|
| D1 database | `backy-db` | `backy-db-test` |
| R2 bucket | `backy` | `backy-test` |

**Mechanism (legacy):** `apps/web_legacy/.env.test` overrides `D1_DATABASE_ID` and `R2_BUCKET_NAME`. E2E runners load this file via `apps/web_legacy/scripts/load-env-test.ts` (three-layer safety: file exists → required keys present → values ≠ production) and pass the merged env to child dev servers.

**Mechanism (worker):** `apps/worker/wrangler.toml` `[env.test]` declares separate D1/R2 bindings + `E2E_SKIP_AUTH = "true"`; `accessAuth` middleware short-circuits when that env is set and injects `accessEmail = "e2e@local.test"`.

**Seed:** `POST /api/db/seed-test-project` ensures the `backy-test` project exists with correct baseline state. Gated by `E2E_SKIP_AUTH`.

## Release

Version is managed in `package.json` (single source of truth). Versioning follows SemVer: X (major/breaking), Y (minor/feature), Z (patch/fix). Default bump is Z+1.

> **Full spec**: `search-memory "开发规范：版本号的维护"`

```bash
bun run release              # Z+1 patch (default)
bun run release -- minor     # Y+1 minor
bun run release -- major     # X+1 major
bun run release -- --dry-run # preview without side effects
```

The script auto-detects project name and CHANGELOG format, then: bumps version → syncs lockfile → generates CHANGELOG → commits → pushes → tags → creates GitHub release.

## Retrospective

- **AWS SDK v3 Body is not ReadableStream**: When using `@aws-sdk/client-s3` `GetObjectCommand`, the `response.Body` is a `SdkStreamMixin` (not a Web `ReadableStream`). Must use `body.transformToByteArray()` or `body.transformToString()` instead of `body.getReader()`. This caused 500 errors in preview and extract routes — caught by E2E.
- **Bun's `typeof fetch` requires `preconnect`**: When mocking `globalThis.fetch` in Bun tests, the type includes a `preconnect` property. Use a helper function that adds `fn.preconnect = () => {}` to satisfy the type.
- **E2E self-bootstrap pattern**: The `backy-test` project (ID: `mnp039joh6yiala5UY0Hh`) is auto-seeded in the test D1 (`backy-db-test`) via `POST /api/db/seed-test-project`. Tests upload real data to test R2 (`backy-test`), verify round-trip, then clean up. Uses `E2E_SKIP_AUTH=true` to bypass OAuth. Test resources are isolated from production — see "Test Resource Isolation" section.
- **D1 timeout (error 7429) needs retry**: Cloudflare D1 HTTP API can return transient `7429` timeout errors (`D1 DB storage operation exceeded timeout which caused object to be reset.`) even for simple INSERT queries. Without retry logic, this causes 500s in the webhook POST endpoint. Fixed by adding exponential backoff retry (3 attempts, 500/1000/2000ms) to `executeD1Query` in `d1-client.ts`.
- **Schema migration ordering: indexes on migration columns**: When `initializeSchema` creates indexes in `SCHEMA_SQL` that reference columns added by later `ALTER TABLE` migrations, existing databases fail with `SQLITE_ERROR: no such column`. Fix: indexes depending on migration columns must execute *after* the migration, not in the main `SCHEMA_SQL` block.
- **Next.js `.next/dev/lock` prevents parallel instances**: Two Next.js dev servers sharing the same project directory will conflict on `.next/dev/lock` even on different ports. The E2E runner must clean stale lock files before starting its own server on a dedicated port (17017). Never rely on detecting/reusing an existing dev server — always start a fresh one with known env vars.
- **Bun `mock.module` is global and irreversible**: `mock.module("@/lib/foo")` replaces the module for ALL test files in the run, not just the calling file. If `a.test.ts` mocks `@/lib/db/d1-client` and `b.test.ts` tests the real `d1-client` via `fetch` mocking, `b.test.ts` will break. Fix: route-level tests that need to mock a module whose real implementation is tested elsewhere must use `fetch` mocking or real pure functions instead. Never `mock.module` a low-level module (like `d1-client`, `cron-logs`, `ip`) if any other test file depends on its real implementation.
- **Quality system: osv-scanner must hard fail on vulns**: Initial implementation treated osv-scanner exitCode 1 (vulnerabilities found) as warn-only (`ok: true, warn: true`), allowing pushes with known vulnerabilities. This violated the "0 vulnerabilities" gate contract. Fix: all non-zero exit codes are hard failures. Indirect deps that can't be fixed go in `osv-scanner.toml` with 90-day expiry. Memory ref: `c64f9f90` (backy: 质量体系 L1+L2+L3+G1+G2 实施记录).
- **Quality system: lint-staged must not --fix**: lint-staged is a gate, not a formatter. Using `--fix` during commit creates a mismatch between tested code and committed code. Always use check-only mode (`eslint --max-warnings 0` without `--fix`).
- **Quality system: push tag with --no-verify**: `git push origin vX.Y.Z --no-verify` is correct for tag pushes. Code was already verified by the main branch push (L2 146/146 + G2 clean). Running pre-push hook again for a tag is redundant and can fail due to dev server resource contention.
- **Security: decompression bomb defense requires streaming limits**: `gunzipAsync(buffer)` fully decompresses into memory before any size check. A 50MB high-compression-ratio archive can decompress to GB+. Fix: use `createGunzip()` streaming with incremental byte counting and early `destroy()` when exceeding `MAX_DECOMPRESSED_SIZE` (50MB). ZIP entries should check `_data.uncompressedSize` metadata before decompressing. Tar entries need per-entry `header.size` checks during streaming.
- **Security: sensitive fields must be stripped at API boundary**: `SELECT *` in DB queries is fine for internal use, but API routes must sanitize before responding. Use explicit field allowlisting (not field deletion) in `sanitizeProject()` to prevent future schema additions from being accidentally exposed.
- **Security: x-forwarded-host must be validated against ALLOWED_HOSTS**: Any route that uses `x-forwarded-host` to build URLs containing credentials (tokens, secrets) MUST validate against the host allowlist first. Extracted to shared `src/lib/hosts.ts` to prevent duplication.
- **Security: SSRF CIDR blocklist must cover all RFC-reserved ranges**: Initial blocklist only covered 6 common private ranges. Missing: `100.64.0.0/10` (CGN), `198.18.0.0/15` (benchmarking), TEST-NETs, `240.0.0.0/4` (reserved), broadcast. IPv6 needs `100::/64` (discard) and `2001:db8::/32` (documentation).
- **Monorepo: `.env*` must move with the app, not stay at the repo root**: Bun reads `.env*` from the cwd at process start. After moving the Next.js app under `apps/web/`, leaving `.env` at the repo root caused 80 unit tests to fail because route modules read `process.env.X` at import time and got empty strings. Fix: `.env`, `.env.example`, `.env.test` live next to the workspace that consumes them.
- **Monorepo: pre-commit lint-staged surfaces dormant rule violations on bulk renames**: Moving 100+ tracked files into `apps/web/` flagged 17 `react-hooks/{set-state-in-effect,static-components}` errors that existed in main but had never been touched by an incidental edit. lint-staged only lints *changed* paths, so violations introduced by a config upgrade (next-config 16) can sit dormant until something restages them. Disabled both rules with a `TODO` comment; track the cleanup separately so the structural commit stays focused.
- **Monorepo: ESLint `tseslint.configs.strict` collides with `eslint-config-next/typescript`**: Both register the `@typescript-eslint` plugin. After `next-config@16.1.7` started shipping its own registration, declaring `typescript-eslint` directly throws `Cannot redefine plugin "@typescript-eslint"`. Fix: spread strict configs but strip their `plugins` key (`const { plugins, ...rest } = config; void plugins;`). Pin `typescript-eslint@8.56.0` to match the version next-config bundles.
- **Monorepo: `vite build` with `emptyOutDir: true` deletes dotfiles**: `apps/web/vite.config.ts` writes to `apps/worker/static/` and clears it each build. The previously committed `static/.gitignore` (rules to ignore the build output itself) gets nuked, so subsequent builds dirty the repo. Fix: `apps/web` `build` script re-emits the gitignore via `printf > ../worker/static/.gitignore` after vite finishes.
