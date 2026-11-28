# Backy

Backup ingestion for applications and agents: Hono Worker webhook/API receive, D1 (`backy-db`) metadata, R2 (`backy`) blobs, and a Vite/React SPA (`@nocoo/basalt`).
Docs: [README.md](README.md) · [Docs Index](docs/README.md) · [Development Guide](docs/10-development.md) · [Direct Upload](docs/09-large-file-direct-upload.md) · [Retrospective](Retrospective.md)

`docs/01-design.md` predates the current Vite/Worker architecture; use [docs/10-development.md](docs/10-development.md) for current setup and integration rules. Raise weaker enforcement instead of lowering this contract.

## Commands

Run from root with Bun (CI `1.3.11`), TypeScript 7, and Node `>=22.23.4`. `bun run dev` uses configured remote bindings (`remote = true`); read [docs/10-development.md](docs/10-development.md) first. Tests need no prod credentials.

```sh
bun install --frozen-lockfile     # installs workspaces and Husky hooks
bun run dev                       # Vite 7017 (backy.dev.hexly.ai) + Worker 7018
bun run typecheck                 # S1 across all workspaces
bun run lint                      # S2 Biome check-only, 0 warnings
bun run build                     # B1 builds SPA into apps/worker/static/
bun run test:coverage             # L1 Vitest (90/85/90/90 floors)
bun run test:e2e:api              # L3 local Worker HTTP E2E on 17018
bunx playwright install chromium  # one-time browser install for L4
bun run test:e2e:bdd              # L4 builds SPA + Playwright E2E on 17018
bun run gate:security             # G1 gitleaks + G2 osv-scanner locally
```

`test:e2e:api` and `test:e2e:bdd` both bind port `17018`; run them sequentially. BDD builds the SPA automatically; API E2E spawns a local Worker and initializes schema/`_test_marker`. Per-workspace scripts live in `package.json`.

## Workspace Layout

| Path               | Role                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------- |
| `apps/web/`        | Vite/React + `@nocoo/basalt` SPA (dev `7017`), builds into `apps/worker/static/`        |
| `apps/worker/`     | Hono Worker, Cloudflare Access auth, D1/R2 bindings, hourly scheduled jobs (dev `7018`) |
| `packages/api/`    | Runtime-agnostic backup/storage handlers, D1/R2 adapters, extractors                    |
| `apps/cli/`        | CLI package (currently a placeholder)                                                   |
| `e2e/`, `scripts/` | HTTP/BDD E2E suites, local runners, quality gates (`scripts/gate-*.ts`), release script |

## Invariants

- **Auth**: Dashboard uses Cloudflare Access JWT; webhook/CLI integrations use project tokens. `E2E_SKIP_AUTH` is restricted to guarded local test runners.
- **API safety**: Sanitize/allowlist API responses and inputs, validate `x-forwarded-host` (`ALLOWED_HOSTS`), cap streaming decompression, and keep upload limits in [docs/09](docs/09-large-file-direct-upload.md).
- **Restore safety**: Restoring returns the original file or a signed download URL; never silently import data into a caller's database.
- **Version & secrets**: Root `package.json` is the version source (display with `v` prefix). Keep ignored secrets next to consuming workspaces; Worker uses `apps/worker/.dev.vars` without a tracked template.
- **Test isolation**: Tests must never use production or daily-dev D1/R2 despite `remote = true` in `apps/worker/wrangler.toml`; never create remote `-test` resources.
- **Testing & UI**: Never `mock.module` low-level D1/R2 modules (process-wide in Bun). Keep views thin, isolate logic in `packages/api/`, and follow `@nocoo/basalt` rules (`system1-design-basalt`).
- **Static assets**: Vite writes `apps/worker/static/` with `emptyOutDir`; restore its `.gitignore` after builds (`apps/web` build script does this). Build the SPA before any authorized Worker deploy.
- **Release & CD**: Production deploys require explicit authorization. Maintainers use `bun run release`; `.github/workflows/pipeline.yml` (`deploy` job, `D1`–`D5` via `deploy-worker.yml`) deploys on `main` push after `quality / Z1: Gate` passes (or manual `workflow_dispatch` with `deploy=true`), reusing the `B1` `apps/worker/static/` artifact without rebuilding, applying incremental D1 migrations, deploying the Worker, and verifying `/api/live`.
- **CD exclusivity**: Never run a parallel `bun run worker:deploy` that races CD. Deployment credentials differ from Access JWT credentials; see [docs/10-development.md](docs/10-development.md).

## Quality & Local Gates

Follows `system1-quality`; CI slot definitions and pinned `nocoo/base-ci` revision live in `.github/workflows/quality-slots.yml` (called by `.github/workflows/pipeline.yml`, `quality / Z1: Gate` required on `main`). Status vocabulary: `enforced`, `planned`, `manual`, `N/A`.

- **Exceptions / gaps**: `L2 Runtime` is `N/A` (`wrangler dev` integration covered by `L3`/`L4`); `P1 Package` runs `wrangler deploy --dry-run` in `apps/worker` reusing `B1` (`enforced`); `L4` reuses `B1` (`apps/worker/static/`, `SKIP_WEB_BUILD=1`). All other CI slots are `enforced`.
- **Coverage boundary**: `L1 Unit` enforces 90/85/90/90 (statements/branches/functions/lines) in `vitest.config.ts` across workspace `src/**` (excluding TSX views, hooks, auth glue, DB/S3 adapters, CLI entry).
- **Local hooks**: `bun install` restores Husky (`.husky/`). Hooks are check-only; never bypass with `--no-verify` on commits or branch pushes.
- **Pre-commit**: Runs on a Git index snapshot (rejecting staged-only breakage): `gate:secrets`, `typecheck`, `lint`, `gate:routes`, `gate:pages`, and `test:coverage`.
- **Pre-push**: Runs `gate:deps` (`osv-scanner` on `bun.lock`) only; `B1`/`L3` + `G2` against stdin push refs (<3 min) is `planned`.

## Resources & Isolation

| Lane           | Endpoint / State                                   | Boundary                                                                     |
| -------------- | -------------------------------------------------- | ---------------------------------------------------------------------------- |
| Daily dev      | Vite `7017` (`backy.dev.hexly.ai`), Worker `7018`  | Wrangler bindings have `remote = true`; use intended dev resources, not prod |
| API E2E (`L3`) | `127.0.0.1:17018`, `apps/worker/.wrangler/e2e-api` | Local miniflare D1/R2 + local S3 direct-upload interface + `_test_marker`    |
| BDD E2E (`L4`) | `127.0.0.1:17018`, `apps/worker/.wrangler/e2e-bdd` | Local Playwright lane; shares port `17018`, run sequentially with `L3`       |
| Prod           | `https://backy.hexly.ai` (`backy-db`, `backy` R2)  | Read-only checks unless release/deploy is authorized                         |

Required Worker harness: reject remote bindings/prod credential fallback, allocate a fresh per-run persist dir, assert local test mode, and initialize/verify `_test_marker` before reset/cleanup. Current fixed-dir harness is partial; [docs/05-test-resource-isolation.md](docs/05-test-resource-isolation.md) is superseded.

## Retrospective

Record incident narratives in [Retrospective.md](Retrospective.md); promote recurring project constraints to `Invariants` above, cross-project lessons to global rules, and enforceable safeguards to tests/hooks.
