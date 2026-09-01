# Backy

Backup ingest for SaaS AI agents: webhook receive, D1 metadata, R2 blobs, Vite dashboard. Profile: ts-worker-web.
Direction: [README.md](README.md) (current). [docs/01-design.md](docs/01-design.md) is pre-Vite/Railway and stale. Frameworks must not rewrite this file.

## Sources of Truth

This file is the **contract**. Hooks, CI, and config are **enforcement**. If they disagree, that is a failure — raise enforcement; never lower this file.

| Fact | Where |
|---|---|
| Agent handbook | this file |
| Human docs | README.md, `docs/` |
| Version | root `package.json` `"version"` |
| Enforcement | `.husky/*`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `scripts/gate-*.ts`, vitest configs |
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
| Runtime | Hono on Cloudflare Workers; Vite 8 SPA |
| Lint | Biome |
| Tests | Vitest L1 (≥95% stmts/lines in workspace configs) + L2 `test:e2e:api` + L3 Playwright |
| Data | D1 `backy-db` + R2 `backy` |

```
apps/web/       Vite SPA :7017
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
| Logic | L1 vitest; root 95/90 branches, web+api 95 all | enforced | pre-commit → `test:coverage` (working tree) |
| API L2 | real HTTP vs local wrangler :17018 | enforced | CI `l2-command`; pre-push **planned** (not in husky) |
| UI L3 | Playwright | enforced | CI `l3-command`; pre-push **planned** |
| Types / lint | tsc + Biome staged | enforced | pre-commit → `typecheck`, `lint:staged` (no `--fix`) |
| G2 secrets | gitleaks | enforced | pre-commit → `gate:secrets` |
| G2 deps | osv-scanner | enforced | pre-push → `gate:deps` only |
| Route/page maps | static `url()` scan (assumes GET) + page visits | enforced | pre-commit → `gate:routes`, `gate:pages` (not full method coverage) |
| Bundler | `vite build` → worker static | enforced | CI L3 / CD build; pre-push **planned** |
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
| Dev | 7018 worker, 7017 vite | `wrangler.toml` `remote = true` may hit prod D1/R2 |
| L2 | 17018 | `--local --persist-to=.wrangler/e2e-api/` + `_test_marker` |
| L3 | BDD persist `.wrangler/e2e-bdd/` | same marker rule |

## Operations / Release

- Version: `bun run release` (bumps, changelog, tag). Do not `worker:deploy` in the same breath — build SPA first; CD/CI own live-check.
- Auth for the app is Cloudflare Access JWT, not the deploy credential. Isolation: local `--persist-to` (docs/05 is superseded).

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
