# Backy

AI backup management service. Receive, store, preview, and restore backups sent by SaaS AI agents via webhooks.

## Tech Stack

| Component | Choice |
|---|---|
| Runtime | Bun |
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict mode) |
| UI | Tailwind CSS v4 + shadcn/ui (basalt design system) |
| Charts | Recharts |
| Validation | Zod v4 |
| Auth | NextAuth v5 + Google OAuth (whitelist) |
| Metadata DB | Cloudflare D1 (remote REST API) |
| File Storage | Cloudflare R2 (S3-compatible API) |
| Deployment | Railway + Docker, port 7017 |
| Domain | your-domain.example.com |

## Project Structure

This is a **Bun monorepo** (`workspaces: ["apps/*", "packages/*"]`).

```
apps/
  web_legacy/              # @backy/web-legacy — Next.js 16 + NextAuth (FROZEN, see docs/07)
  web/                     # @backy/web — placeholder, Vite SPA target (Wave D)
  worker/                  # @backy/worker — placeholder, Hono on CF Workers (Wave C)
  cli/                     # @backy/cli — placeholder, AI-facing CLI (next wave)
packages/
  api/                     # @backy/api — placeholder, shared API/business logic (next wave)
```

The root `package.json` only carries `husky` + workspace plumbing; every script
(`dev`, `build`, `test`, `typecheck`, `lint`, `gate:security`, `release`, …)
forwards into `apps/web_legacy` via `bun --cwd apps/web_legacy …` while the
migration in `docs/07-vite-web-migration-plan.md` is in flight. `legacy:*`
prefixed aliases call the same workspace explicitly. Husky hooks live at the
repo root and call those forwarders unchanged. `typecheck` and `test` also fan
out to `packages/api` and `apps/cli`. The new `apps/web` and `apps/worker`
directories are empty scaffolds today and only ship a placeholder `build` script.

The legacy web workspace itself:

```
apps/web_legacy/
  src/
    app/
      api/                 # 26 route files, 39 HTTP method handlers
        auth/              # NextAuth v5 handler (Google OAuth)
        backups/           # CRUD + upload, download, preview, extract, restore-command
        categories/        # CRUD
        cron/              # Auto-backup trigger + logs
        db/init/           # D1 schema initialization
        ip-info/           # IP geolocation proxy
        live/              # Health check (D1 + R2 ping)
        logs/              # Webhook audit logs
        projects/          # CRUD + token regeneration + prompt generation
        restore/           # Public presigned download (token-auth)
        stats/             # Dashboard totals + chart data
        webhook/           # AI agent ingestion endpoint (HEAD/GET/POST)
      backups/             # Backup list + detail pages
      cron-logs/           # Cron log viewer page
      login/               # Google OAuth login page
      logs/                # Webhook log viewer page
      projects/            # Project list + detail + new pages
      page.tsx             # Dashboard (stats, charts, recent backups)
      layout.tsx           # Root layout (AuthProvider, theme FOUC prevention)
    auth.ts                # NextAuth v5 config (Google OAuth, email whitelist)
    proxy.ts               # Next.js 16 proxy convention (replaces middleware.ts)
    components/
      charts/              # Recharts: activity, cron, project charts
      layout/              # App shell, sidebar, breadcrumbs, theme toggle
      ui/                  # 11 shadcn/ui primitives
    hooks/                 # useIsMobile
    lib/
      backup/              # File type detection, archive extractors, R2 key generation
      db/                  # D1 client, schema, CRUD modules (projects, backups, categories, webhook-logs, cron-logs)
      r2/                  # S3-compatible R2 client (upload, download, presign, delete)
      id.ts                # nanoid generators (21-char ID, 48-char webhook token)
      hosts.ts             # Shared ALLOWED_HOSTS set + buildBaseUrl() for reverse proxy
      sanitize.ts          # Strip sensitive fields from Project records for API responses
      ip.ts                # IP/CIDR validation and enforcement
      test-project.ts      # E2E test project constants (single source of truth)
  scripts/
    check-coverage.ts      # Coverage gate (90%+ threshold)
    load-env-test.ts       # .env.test loader with three-layer safety
    run-e2e.ts             # L3 API E2E server lifecycle + runner
  worker/                  # Cloudflare Worker for cron triggers (separate package)
  e2e/                     # L2 + L3 test suites (see "Test Structure" below)
  .env, .env.test          # Cwd-local — module-load-time process.env reads must resolve here
```

> The `@backy/api` and `@backy/cli` packages currently contain only a
> `PACKAGE_NAME` stamp and one unit test each. They reserve the import
> namespace; the actual extraction happens in the next refactor wave.

## Quality System (3 Test Layers + 2 Gates)

| Layer | Tool | Script | Trigger | Requirement |
|---|---|---|---|---|
| L1 Unit | bun test | `bun run test:coverage` | pre-commit | 90%+ coverage, 486 tests |
| L2 Integration/API | Custom BDD runner | `bun run test:e2e:api` | pre-push | 146 tests, 37 route/method combos |
| L3 System/E2E | Playwright (Chromium) | `bun run test:e2e:bdd` | on-demand | 5 core user flow specs |
| G1 Static Analysis | tsc + ESLint | `bun run typecheck && bun run lint:staged` | pre-commit | 0 errors, 0 warnings (`--max-warnings 0`) |
| G2 Security | osv-scanner + gitleaks | `bun run gate:security` | pre-push | 0 vulnerabilities, 0 leaked secrets, hard fail if tool missing |

### Hooks Mapping

| Hook | Budget | Runs |
|---|---|---|
| pre-commit | <30s | G1 → L1 (sequential) |
| pre-push | <3min | L2 ‖ G2 (parallel) |
| on-demand | — | L3 |

### Port Convention

| Purpose | Port |
|---|---|
| Dev server | 7017 |
| L2 API E2E | 17017 |
| L3 BDD E2E | 27017 |

### Core Principles

1. **Catch early** — no accumulating tech debt
2. **Self-resolve** — no relying on manual review for basic errors
3. **Quality gate** — bad code cannot enter main branch

### Test Structure

Paths below are relative to `apps/web_legacy/` (the only workspace with tests
today). The placeholder `@backy/api` and `@backy/cli` packages each ship a
single unit test under `packages/api/src/__tests__/` and
`apps/cli/src/__tests__/`.

```
src/__tests__/          # L1 unit tests (35 files, 486 tests)
  helpers.ts            # Shared: mockFetch, d1Success/d1Error, stubs, builders
e2e/api/                # L2 API E2E (21 suites, 148 defined, 146 run)
  config.ts             # Constants, shared mutable state
  framework.ts          # Minimal BDD framework (test, assert, assertEqual)
  helpers.ts            # Upload helpers, builders
  runner.ts             # Main runner, exports runE2ETests(url)
  suites/               # 21 individual suite files
e2e/bdd/                # L3 Playwright BDD E2E (5 specs, 17 tests)
  playwright.config.ts  # Playwright config (Chromium, serial, headless)
  runner.ts             # Server lifecycle (port 27017) + playwright exec
  specs/                # 5 spec files (dashboard, projects, backup, upload, nav)
```

## Common Commands

All commands run from the repo root and forward into `apps/web_legacy` (or
fan out to other workspaces where noted).

```bash
bun dev                # Dev server (7017)
bun run build          # Production build
bun test               # Unit tests (web + packages/api + apps/cli)
bun run test:coverage  # Web unit tests + 90% coverage gate
bun run typecheck      # TypeScript type check across all workspaces
bun run lint           # ESLint (web)
bun run lint:staged    # ESLint on staged files only (web)
bun run gate:security  # Security scan (osv-scanner + gitleaks)
bun run test:e2e:api   # L2 API E2E (port 17017)
bun run test:e2e:bdd   # L3 Playwright BDD E2E (port 27017)
```

## Test Resource Isolation

E2E tests (L2 + L3) use **dedicated Cloudflare D1 + R2** to prevent production data corruption.

| Resource | Production | Test |
|---|---|---|
| D1 database | `backy-db` | `backy-db-test` |
| R2 bucket | `backy` | `backy-test` |

**Mechanism:** `apps/web_legacy/.env.test` overrides `D1_DATABASE_ID` and `R2_BUCKET_NAME`. E2E runners load this file via `apps/web_legacy/scripts/load-env-test.ts` (three-layer safety: file exists → required keys present → values ≠ production) and pass the merged env to child dev servers.

**Seed:** `POST /api/db/seed-test-project` ensures the `backy-test` project exists with correct baseline state (name, token, all optional fields reset). Gated by `E2E_SKIP_AUTH`.

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
