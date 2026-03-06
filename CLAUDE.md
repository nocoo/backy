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
    api/                 # 24 route files, 37 HTTP method handlers
      auth/              # NextAuth v5 handler (Google OAuth)
      backups/           # CRUD + upload, download, preview, extract
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
    ip.ts                # IP/CIDR validation and enforcement
scripts/
  check-coverage.ts      # Coverage gate (90%+ threshold)
  run-e2e.ts             # L3 API E2E server lifecycle + runner
```

## Four-Tier Testing

| Layer | Tool | Script | Trigger | Requirement |
|---|---|---|---|---|
| L1 UT | bun test | `bun test` | pre-commit | 90%+ coverage (functions & lines) |
| L2 Lint | eslint | `bun run lint` | pre-commit | Zero errors/warnings |
| L3 API E2E | Custom BDD runner | `bun run test:e2e:api` | pre-push | 148 tests, 37 API route/method combos |
| L4 BDD E2E | Playwright (Chromium) | `bun run test:e2e:bdd` | on-demand | 5 core user flow specs |

### Port Convention

| Purpose | Port |
|---|---|
| Dev server | 7026 |
| L3 API E2E | 17026 |
| L4 BDD E2E | 27026 |

### Core Principles

1. **Catch early** — no accumulating tech debt
2. **Self-resolve** — no relying on manual review for basic errors
3. **Quality gate** — bad code cannot enter main branch

### Test Structure

```
src/__tests__/          # L1 unit tests (34 files, 421 tests)
  helpers.ts            # Shared: mockFetch, d1Success/d1Error, stubs, builders
e2e/api/                # L3 API E2E (21 suites, 148 tests)
  config.ts             # Constants, shared mutable state
  framework.ts          # Minimal BDD framework (test, assert, assertEqual)
  helpers.ts            # Upload helpers, builders
  runner.ts             # Main runner, exports runE2ETests(url)
  suites/               # 21 individual suite files
e2e/bdd/                # L4 Playwright BDD E2E (5 specs, 17 tests)
  playwright.config.ts  # Playwright config (Chromium, serial, headless)
  runner.ts             # Server lifecycle (port 27026) + playwright exec
  specs/                # 5 spec files (dashboard, projects, backup, upload, nav)
```

## Common Commands

```bash
bun dev              # Dev server (7026)
bun run build        # Production build
bun test             # Unit tests
bun run lint         # ESLint
bun run test:e2e:api # L3 API E2E (port 17026)
bun run test:e2e:bdd # L4 Playwright BDD E2E (port 27026)
```

## Retrospective

- **AWS SDK v3 Body is not ReadableStream**: When using `@aws-sdk/client-s3` `GetObjectCommand`, the `response.Body` is a `SdkStreamMixin` (not a Web `ReadableStream`). Must use `body.transformToByteArray()` or `body.transformToString()` instead of `body.getReader()`. This caused 500 errors in preview and extract routes — caught by E2E.
- **Bun's `typeof fetch` requires `preconnect`**: When mocking `globalThis.fetch` in Bun tests, the type includes a `preconnect` property. Use a helper function that adds `fn.preconnect = () => {}` to satisfy the type.
- **E2E self-bootstrap pattern**: The `backy-test` project (ID: `mnp039joh6yiala5UY0Hh`) is permanently available in D1 for E2E testing. Tests upload real data, verify round-trip, then clean up. Uses `E2E_SKIP_AUTH=true` to bypass OAuth for protected routes during local testing.
- **D1 timeout (error 7429) needs retry**: Cloudflare D1 HTTP API can return transient `7429` timeout errors (`D1 DB storage operation exceeded timeout which caused object to be reset.`) even for simple INSERT queries. Without retry logic, this causes 500s in the webhook POST endpoint. Fixed by adding exponential backoff retry (3 attempts, 500/1000/2000ms) to `executeD1Query` in `d1-client.ts`.
- **Schema migration ordering: indexes on migration columns**: When `initializeSchema` creates indexes in `SCHEMA_SQL` that reference columns added by later `ALTER TABLE` migrations, existing databases fail with `SQLITE_ERROR: no such column`. Fix: indexes depending on migration columns must execute *after* the migration, not in the main `SCHEMA_SQL` block.
- **Next.js `.next/dev/lock` prevents parallel instances**: Two Next.js dev servers sharing the same project directory will conflict on `.next/dev/lock` even on different ports. The E2E runner must clean stale lock files before starting its own server on a dedicated port (17026). Never rely on detecting/reusing an existing dev server — always start a fresh one with known env vars.
- **Bun `mock.module` is global and irreversible**: `mock.module("@/lib/foo")` replaces the module for ALL test files in the run, not just the calling file. If `a.test.ts` mocks `@/lib/db/d1-client` and `b.test.ts` tests the real `d1-client` via `fetch` mocking, `b.test.ts` will break. Fix: route-level tests that need to mock a module whose real implementation is tested elsewhere must use `fetch` mocking or real pure functions instead. Never `mock.module` a low-level module (like `d1-client`, `cron-logs`, `ip`) if any other test file depends on its real implementation.
