# Backy

Backup ingest for SaaS AI agents: webhook receive, D1 metadata, R2 blobs, Vite dashboard. Profile: ts-worker-web.
Direction: [docs/01-design.md](docs/01-design.md). Frameworks must not rewrite this file.

## Sources of Truth

This file is the **contract**. Hooks, CI, and config are **enforcement**. If they disagree, that is a failure — raise enforcement; never lower this file.

| Fact | Where |
|---|---|
| Agent handbook | this file |
| Human docs | README.md, `docs/` |
| Version | root `package.json` `"version"` (`1.11.0`) |
| Enforcement | `.husky/*`, `scripts/gate-*.ts`, `scripts/run-e2e.ts`, vitest configs |
| Machine rules | global `AGENTS.md`, `rules/git-commit.md` |
| Accidents | [Retrospective.md](Retrospective.md) |
| Env files | next to the consuming workspace, not repo root |

## Project Invariants

- L2/L3 must use `wrangler dev --local --persist-to` plus `_test_marker`. Never run E2E against prod D1/R2 even though `wrangler.toml` sets `remote = true` for interactive `bun dev`.
- Cloudflare Access JWT for the dashboard; webhook/CLI use their own tokens. Do not skip auth except `E2E_SKIP_AUTH` on the isolated runner.
- Sanitize at the API boundary (allowlist). Validate `x-forwarded-host`. Stream-decompress with a size cap.
- Do not `mock.module` low-level D1/R2 modules. lint-staged is check-only. Re-emit `apps/worker/static/.gitignore` after vite `emptyOutDir`.

## Stack / Layout

| Component | Choice |
|---|---|
| Language | TypeScript 7 strict |
| Package manager | Bun workspaces |
| Runtime | Hono on Cloudflare Workers; Vite 7 SPA |
| Lint | Biome |
| Tests | Vitest L1 (≥95% stmts/lines in workspace configs) + L2 `test:e2e:api` + L3 Playwright |
| Data | D1 `backy-db` + R2 `backy` |

```
apps/web/       Vite SPA :7019
apps/worker/    Hono + assets :7018
packages/api/   handlers, lib
e2e/            L2 API + L3 BDD
scripts/        gates, release, e2e runner
```

## Commands

```bash
bun dev
bun run typecheck
bun run lint
bun run build
bun run test:coverage
bun run test:e2e:api
bun run test:e2e:bdd
bun run release
```

## Verification

Status: `enforced` | `planned` | `manual` | `N/A`. `enforced` Evidence = hook/CI/config/script. `planned` has no Evidence.

Org gaps: index-snapshot pre-commit; stdin-range pre-push; wire L2 into pre-push again.

| Change | Proof | Status | Evidence |
|---|---|---|---|
| Logic | L1 vitest ≥95% (configs; CLAUDE used to say 90%) | enforced | pre-commit → `test:coverage` (working tree) |
| API L2 | real HTTP vs local wrangler :17018 | planned | — (script `test:e2e:api` exists; **not** in `.husky/pre-push`) |
| UI L3 | Playwright | planned | — (`test:e2e:bdd` on-demand; `gate:pages` checks coverage of existing specs) |
| Types / lint | tsc + Biome staged | enforced | pre-commit → `typecheck`, `lint:staged` (no `--fix`) |
| G2 secrets | gitleaks | enforced | pre-commit → `gate:secrets` |
| G2 deps | osv-scanner | enforced | pre-push → `gate:deps` only |
| Route/page maps | every route/page has a test visit | enforced | pre-commit → `gate:routes`, `gate:pages` |
| Bundler | `vite build` → worker static | manual | `bun run build` / `worker:deploy` |
| Docs | numbered doc if behavior changes | manual | human review |
| Release | `bun run release` | manual | `scripts/release.ts` (commits/pushes/tags) |

| Hook | Org bar | Status | Evidence |
|---|---|---|---|
| pre-commit | index snapshot for G1+L1 | planned | — |
| pre-push | stdin ref range + L2 | planned | — (today: `gate:deps` only) |

`--no-verify` forbidden on commits and branch pushes. Tag-only may skip.

## Resources / Isolation

| Purpose | Port / resource | Isolation |
|---|---|---|
| Dev | 7018 worker, 7019 vite | `wrangler.toml` `remote = true` may hit prod D1/R2 |
| L2 | 17018 | `--local --persist-to=.wrangler/e2e-api/` + `_test_marker` |
| L3 | BDD persist `.wrangler/e2e-bdd/` | same marker rule |

## Operations / Release

- Entry: `bun run release` then `bun run worker:deploy`. Auth: wrangler + Access. Isolation: [docs/05-test-resource-isolation.md](docs/05-test-resource-isolation.md).
- Before ship: run L2/L3 if API/UI changed; do not deploy unmigrated D1.

## Retrospective

| Kind | Where |
|---|---|
| Accident narrative | [Retrospective.md](Retrospective.md) |
| Recurring project rule | one line here |
| Cross-project | nmem / global rules |
| Checkable rule | hook or test |

- E2E stays on `--local --persist-to` + `_test_marker`, even when `bun dev` uses `remote = true`.
- lint-staged is check-only; G2 hard-fails; no `mock.module` on D1/R2.
- Sanitize/allowlist at API boundary; stream-decompress with a cap.
