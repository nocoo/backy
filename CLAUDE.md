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
| Deployment | Railway + Docker, port 7026 |
| Domain | backy.dev.hexly.ai |

## Project Structure

```
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
```

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
| Dev server | 7026 |
| L2 API E2E | 17026 |
| L3 BDD E2E | 27026 |

### Core Principles

1. **Catch early** — no accumulating tech debt
2. **Self-resolve** — no relying on manual review for basic errors
3. **Quality gate** — bad code cannot enter main branch

### Test Structure

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
  runner.ts             # Server lifecycle (port 27026) + playwright exec
  specs/                # 5 spec files (dashboard, projects, backup, upload, nav)
```

## Common Commands

```bash
bun dev                # Dev server (7026)
bun run build          # Production build
bun test               # Unit tests
bun run test:coverage  # Unit tests + 90% coverage gate
bun run typecheck      # TypeScript type check
bun run lint           # ESLint
bun run lint:staged    # ESLint on staged files only
bun run gate:security  # Security scan (osv-scanner + gitleaks)
bun run test:e2e:api   # L2 API E2E (port 17026)
bun run test:e2e:bdd   # L3 Playwright BDD E2E (port 27026)
```

## Test Resource Isolation

E2E tests (L2 + L3) use **dedicated Cloudflare D1 + R2** to prevent production data corruption.

| Resource | Production | Test |
|---|---|---|
| D1 database | `backy-db` | `backy-db-test` |
| R2 bucket | `backy` | `backy-test` |

**Mechanism:** `.env.test` overrides `D1_DATABASE_ID` and `R2_BUCKET_NAME`. E2E runners load this file via `scripts/load-env-test.ts` (three-layer safety: file exists → required keys present → values ≠ production) and pass the merged env to child dev servers.

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
- **Next.js `.next/dev/lock` prevents parallel instances**: Two Next.js dev servers sharing the same project directory will conflict on `.next/dev/lock` even on different ports. The E2E runner must clean stale lock files before starting its own server on a dedicated port (17026). Never rely on detecting/reusing an existing dev server — always start a fresh one with known env vars.
- **Bun `mock.module` is global and irreversible**: `mock.module("@/lib/foo")` replaces the module for ALL test files in the run, not just the calling file. If `a.test.ts` mocks `@/lib/db/d1-client` and `b.test.ts` tests the real `d1-client` via `fetch` mocking, `b.test.ts` will break. Fix: route-level tests that need to mock a module whose real implementation is tested elsewhere must use `fetch` mocking or real pure functions instead. Never `mock.module` a low-level module (like `d1-client`, `cron-logs`, `ip`) if any other test file depends on its real implementation.
- **Quality system: osv-scanner must hard fail on vulns**: Initial implementation treated osv-scanner exitCode 1 (vulnerabilities found) as warn-only (`ok: true, warn: true`), allowing pushes with known vulnerabilities. This violated the "0 vulnerabilities" gate contract. Fix: all non-zero exit codes are hard failures. Indirect deps that can't be fixed go in `osv-scanner.toml` with 90-day expiry. Memory ref: `c64f9f90` (backy: 质量体系 L1+L2+L3+G1+G2 实施记录).
- **Quality system: lint-staged must not --fix**: lint-staged is a gate, not a formatter. Using `--fix` during commit creates a mismatch between tested code and committed code. Always use check-only mode (`eslint --max-warnings 0` without `--fix`).
- **Quality system: push tag with --no-verify**: `git push origin vX.Y.Z --no-verify` is correct for tag pushes. Code was already verified by the main branch push (L2 146/146 + G2 clean). Running pre-push hook again for a tag is redundant and can fail due to dev server resource contention.
- **Security: decompression bomb defense requires streaming limits**: `gunzipAsync(buffer)` fully decompresses into memory before any size check. A 50MB high-compression-ratio archive can decompress to GB+. Fix: use `createGunzip()` streaming with incremental byte counting and early `destroy()` when exceeding `MAX_DECOMPRESSED_SIZE` (50MB). ZIP entries should check `_data.uncompressedSize` metadata before decompressing. Tar entries need per-entry `header.size` checks during streaming.
- **Security: sensitive fields must be stripped at API boundary**: `SELECT *` in DB queries is fine for internal use, but API routes must sanitize before responding. Use explicit field allowlisting (not field deletion) in `sanitizeProject()` to prevent future schema additions from being accidentally exposed.
- **Security: x-forwarded-host must be validated against ALLOWED_HOSTS**: Any route that uses `x-forwarded-host` to build URLs containing credentials (tokens, secrets) MUST validate against the host allowlist first. Extracted to shared `src/lib/hosts.ts` to prevent duplication.
- **Security: SSRF CIDR blocklist must cover all RFC-reserved ranges**: Initial blocklist only covered 6 common private ranges. Missing: `100.64.0.0/10` (CGN), `198.18.0.0/15` (benchmarking), TEST-NETs, `240.0.0.0/4` (reserved), broadcast. IPv6 needs `100::/64` (discard) and `2001:db8::/32` (documentation).
