# Backy

Backup ingestion for applications and agents: webhook/API receive, D1 metadata, R2 blobs and a Vite dashboard.
Profile: ts-worker-web.
Human overview: [README.md](README.md). Direction: [development guide](docs/10-development.md); `docs/01-design.md` predates the current Vite/Worker architecture. Frameworks must not rewrite this file. Maintain this root `AGENTS.md` as the only project handbook; do not create a `CLAUDE.md` alias, copy or import.

## Sources of Truth

This file is the contract; hooks, CI and configuration enforce it. Raise weaker enforcement instead of lowering this contract.

| Fact                      | Where                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| Human docs                | [README.md](README.md), [docs index](docs/README.md)                                              |
| Version                   | Root `package.json`; display with a `v` prefix                                                    |
| Enforcement               | `.husky/`, CI/release workflows, Vitest configs, `scripts/gate-*.ts`                              |
| Local secrets             | Ignored files next to the consuming workspace; Worker uses `.dev.vars` without a tracked template |
| Machine rules / accidents | Global `AGENTS.md` and `rules/`; [Retrospective.md](Retrospective.md)                             |

## Project Invariants

- Dashboard auth is Cloudflare Access JWT; webhook/CLI integrations use project tokens. `E2E_SKIP_AUTH` is only for guarded local tests.
- Sanitize and allowlist API input; validate `x-forwarded-host`; cap streaming decompression. Preserve normal-upload and direct-upload size/protocol limits in [docs/09](docs/09-large-file-direct-upload.md).
- Restoring returns the original file or signed download; it never silently imports data into a caller's database.
- Tests must never use production/daily-dev D1 or R2, even though interactive Wrangler config has `remote = true`. Never create remote `-test` resources.
- Do not `mock.module` low-level D1/R2 modules. Keep views thin and isolate business logic from UI.
- Vite writes `apps/worker/static/`; restore its `.gitignore` after `emptyOutDir`. Build the SPA before any authorized Worker deployment.

## Stack / Layout

| Component                    | Choice                                                                      |
| ---------------------------- | --------------------------------------------------------------------------- |
| Runtime / install            | TypeScript 7, Bun workspaces, Node ≥22.12; CI Bun 1.3.11                    |
| App                          | Hono Worker with Vite/React SPA and scheduled backup work                   |
| Data                         | D1 `backy-db`, R2 `backy`, local S3-compatible direct-upload test interface |
| Static / tests               | TypeScript, Biome, Vitest, local HTTP and Playwright                        |
| `apps/web/`, `apps/worker/`  | SPA on 7017; Worker/API/assets on 7018                                      |
| `packages/api/`, `apps/cli/` | Shared backup/storage logic; CLI is currently a placeholder                 |
| `e2e/`, `scripts/`           | HTTP/BDD suites, local runners, gates and release                           |

## Commands

Run from the root with Bun and Node installed. `bun run dev` uses configured remote bindings; inspect [development setup](docs/10-development.md) before starting it. Tests need no Cloudflare production credentials.

```bash
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run build
bun run test:coverage
bun run test:e2e:api
bunx playwright install chromium
bun run test:e2e:bdd
bun run gate:security
```

Both HTTP and BDD runners use port 17018; run them sequentially. BDD builds the SPA automatically; API tests start their own local Worker and initialize its schema/marker. Per-workspace commands are listed in `package.json`.

## Verification

Quality follows System1 v1.3.0 Native Mode (`nocoo/base-ci v2026.15`) in `.github/workflows/quality-slots.yml` and `.github/workflows/ci.yml`. Status: `enforced`, `planned`, `manual`, `N/A`.

| Slot              | Status   | Evidence                                                        |
| ----------------- | -------- | --------------------------------------------------------------- |
| `S1` Types        | enforced | `bun run typecheck` (pre-commit + CI)                           |
| `S2` Lint         | enforced | `bun run lint` (pre-commit + CI)                                |
| `S3` Workflow     | enforced | SHA-pinned workflow action check in CI                          |
| `G1` Secrets      | enforced | `gitleaks` (`.gitleaks.toml`) in pre-commit + CI                |
| `G2` Dependencies | enforced | `osv-scanner` (`osv-scanner.toml`, `bun.lock`) in pre-push + CI |
| `B1` Build        | enforced | `bun run build` in CI                                           |
| `L1` Unit         | enforced | `bun run test:coverage` (95/90/95/95 floors) in pre-commit + CI |
| `L2` Runtime      | N/A      | `wrangler dev` integration covered by `L3`/`L4` runners         |
| `L3` Integration  | enforced | `bun run test:e2e:api` in CI                                    |
| `L4` E2E          | enforced | `bun run test:e2e:bdd` (Playwright Chromium) in CI              |
| `P1` Package      | N/A      | Private monorepo, not published to npm                          |
| `Z1` Gate         | enforced | `quality / Z1: Gate` required status check on `main`            |

| Hook       | Current behavior                                                              | Required follow-up                                                     |
| ---------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| pre-commit | Index snapshot: secrets (staged), typecheck, lint, route/page gates, coverage | Measured warm path <30s; negative fixture rejects staged-only breakage |
| pre-push   | `gate:deps` only                                                              | L2+G2 (and needed build) on stdin push refs, <3min                     |

Install restores Husky. Hooks are check-only; never use `--no-verify` on commits or branch pushes.

## Resources / Isolation

| Lane      | Port / state                           | Boundary                                                                                      |
| --------- | -------------------------------------- | --------------------------------------------------------------------------------------------- |
| Daily dev | Vite 7017, Worker 7018                 | Current bindings can reach remote D1/R2; ordinary development must use intended dev resources |
| L2        | 17018, `apps/worker/.wrangler/e2e-api` | Local runtime and SQLite/R2 simulation                                                        |
| L3        | 17018, `apps/worker/.wrangler/e2e-bdd` | Local browser lane; cannot run alongside L2                                                   |

Required Worker harness: reject remote bindings/production credential fallback; allocate a fresh per-run directory; assert local test mode before fixtures; initialize and verify `_test_marker` before reset/cleanup. The current fixed-directory harness is partial implementation. The older remote-resource plan in `docs/05-test-resource-isolation.md` is superseded by this contract.

## Operations / Release

Authorized maintainers use `bun run release` for version/changelog/commit/tag. `release.yml` deploys the proven CI commit, builds assets and applies incremental D1 migrations. Do not add a parallel `worker:deploy` invocation that races CD.
Deployment credentials differ from Access JWT credentials. Setup, migration and live-check details are in [docs/10-development.md](docs/10-development.md).

## Retrospective

Narratives remain in [Retrospective.md](Retrospective.md); keep only recurring project rules here, cross-project lessons in global rules/nmem, and deterministic requirements in hooks/tests.
