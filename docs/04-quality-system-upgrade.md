# 04 — Quality System Upgrade: L1+L2+L3+G1+G2

> Upgrade from legacy "4-tier testing" to the new "3-tier testing + 2 quality gates" system.

## Background

Backy currently uses the legacy 4-tier testing architecture:

| Old Layer | Role | Trigger |
|---|---|---|
| L1 UT | bun test, 90% coverage | pre-commit |
| L2 Lint | eslint | pre-commit |
| L3 API E2E | Custom BDD runner | pre-push |
| L4 BDD E2E | Playwright | on-demand |

The new quality system restructures this into **3 test layers** (verifying behavior) and **2 quality gates** (verifying standards):

| New Layer | Role | Trigger | Time Budget |
|---|---|---|---|
| **L1** Unit/Component | bun test, ≥90% coverage | pre-commit | <30s |
| **L2** Integration/API | Real HTTP E2E, 100% endpoint coverage | pre-push | <3min |
| **L3** System/E2E | Playwright user flows | CI / on-demand | — |
| **G1** Static Analysis | `tsc --noEmit` + ESLint strict, 0 error/warning | pre-commit (parallel with L1) | <30s |
| **G2** Security/Perf | osv-scanner + gitleaks | pre-push (parallel with L2) | <30s |

## Gap Analysis

| Item | Current | Target | Action |
|---|---|---|---|
| L1 Unit | ✅ 486 tests, 90% gate | ✅ No change | — |
| G1 tsc | ❌ No standalone typecheck | `tsc --noEmit` in pre-commit | Add `typecheck` script |
| G1 lint-staged | ❌ Full lint on every commit | Incremental lint on staged files | Add lint-staged |
| G2 osv-scanner | ❌ Not installed | Dependency vulnerability scan | Install + configure |
| G2 gitleaks | ❌ Not installed | Secrets leak detection | Install + configure |
| Hook wiring | Sequential L1→L2 | Parallel L1‖G1, L2‖G2 | Rewrite hooks |
| Layer renaming | L3→L2, L4→L3 | Script aliases | Update package.json |
| CLAUDE.md | References old 4-tier | Update to new system | Sync documentation |

## Target Hooks Architecture

```
pre-commit (<30s)
├── L1: bun run test:coverage          (unit tests + 90% gate)
└── G1: bun run typecheck && bun run lint:staged   (tsc + eslint on staged files)
    ↕ parallel

pre-push (<3min)
├── L2: bun run test:e2e:api           (API E2E on port 17026)
└── G2: bun run gate:security          (osv-scanner + gitleaks)
    ↕ parallel

on-demand
└── L3: bun run test:e2e:bdd           (Playwright on port 27026)
```

## File Modification Map

| File | Change | Reason |
|---|---|---|
| `package.json` | Add scripts: `typecheck`, `lint:staged`, `gate:security` | New quality gates |
| `package.json` | Add devDeps: `lint-staged` | Incremental lint |
| `eslint.config.mjs` | No change | Already strict via Next.js presets |
| `.lintstagedrc.json` | **New file** | lint-staged config |
| `scripts/gate-security.ts` | **New file** | G2 security gate runner |
| `.husky/pre-commit` | Rewrite to parallel L1‖G1 | New hook architecture |
| `.husky/pre-push` | Rewrite to parallel L2‖G2 | New hook architecture |
| `CLAUDE.md` | Update testing section | Sync documentation |
| `docs/README.md` | Add this document | Index maintenance |

## Atomic Commits

### Commit 1: `feat: add G1 typecheck script`

**Files:**
- `package.json` — add `"typecheck": "tsc --noEmit"` to scripts

**Verification:** `bun run typecheck` passes with 0 errors.

---

### Commit 2: `feat: add lint-staged for incremental G1 lint`

**Files:**
- `package.json` — add `lint-staged` to devDependencies, add `"lint:staged": "lint-staged"` script
- `.lintstagedrc.json` — new file:
  ```json
  {
    "*.{ts,tsx}": ["eslint --fix"],
    "*.{js,mjs}": ["eslint --fix"]
  }
  ```

**Verification:** Stage a `.ts` file, run `bun run lint:staged`, confirm only staged files are linted.

---

### Commit 3: `feat: add G2 security gate (osv-scanner + gitleaks)`

**Files:**
- `scripts/gate-security.ts` — new file: runs `osv-scanner` and `gitleaks` in parallel, reports results, exits non-zero on findings

**Verification:**
- `bun run gate:security` passes (no known vulnerabilities or leaked secrets)
- Both tools must be available: `osv-scanner --version` and `gitleaks version`

**Prerequisites:** Install tools globally:
```bash
# osv-scanner
brew install osv-scanner

# gitleaks
brew install gitleaks
```

**Note:** The script gracefully degrades — if a tool is not installed, it prints a warning and skips that check (non-blocking in dev, blocking in CI). This avoids breaking the hook for collaborators who haven't installed the tools.

---

### Commit 4: `feat: add gate:security script to package.json`

**Files:**
- `package.json` — add `"gate:security": "bun run scripts/gate-security.ts"` to scripts

**Verification:** `bun run gate:security` runs both scanners.

---

### Commit 5: `feat: rewrite pre-commit hook for parallel L1‖G1`

**Files:**
- `.husky/pre-commit` — rewrite to:
  ```bash
  #!/bin/sh

  # L1: Unit tests + coverage gate
  # G1: Static analysis (typecheck + lint-staged)
  # Run in parallel, fail if either fails

  bun run test:coverage &
  PID_L1=$!

  (bun run typecheck && bun run lint:staged) &
  PID_G1=$!

  FAIL=0
  wait $PID_L1 || FAIL=1
  wait $PID_G1 || FAIL=1

  exit $FAIL
  ```

**Verification:** Make a commit — both L1 and G1 run in parallel, output interleaves, commit blocked if either fails.

---

### Commit 6: `feat: rewrite pre-push hook for parallel L2‖G2`

**Files:**
- `.husky/pre-push` — rewrite to:
  ```bash
  #!/bin/sh

  # L2: API E2E (integration tests)
  # G2: Security gate (osv-scanner + gitleaks)
  # Run in parallel, fail if either fails

  bun run test:e2e:api &
  PID_L2=$!

  bun run gate:security &
  PID_G2=$!

  FAIL=0
  wait $PID_L2 || FAIL=1
  wait $PID_G2 || FAIL=1

  exit $FAIL
  ```

**Verification:** Run `git push --dry-run` — both L2 and G2 run in parallel.

---

### Commit 7: `docs: update CLAUDE.md and docs index for quality system upgrade`

**Files:**
- `CLAUDE.md` — update "Four-Tier Testing" section to new "Quality System (L1+L2+L3+G1+G2)" with updated table, hook mapping, and port conventions
- `docs/README.md` — add entry for `04-quality-system-upgrade.md`

**CLAUDE.md testing section update:**

Replace the current "Four-Tier Testing" section with:

```markdown
## Quality System (3 Test Layers + 2 Gates)

| Layer | Tool | Script | Trigger | Requirement |
|---|---|---|---|---|
| L1 Unit | bun test | `bun run test:coverage` | pre-commit | 90%+ coverage, 486 tests |
| L2 Integration/API | Custom BDD runner | `bun run test:e2e:api` | pre-push | 146 tests, 37 route/method combos |
| L3 System/E2E | Playwright (Chromium) | `bun run test:e2e:bdd` | on-demand | 5 core user flow specs |
| G1 Static Analysis | tsc + ESLint | `bun run typecheck && bun run lint:staged` | pre-commit | 0 errors, 0 warnings, strict mode |
| G2 Security | osv-scanner + gitleaks | `bun run gate:security` | pre-push | 0 vulnerabilities, 0 leaked secrets |

### Hooks Mapping

| Hook | Budget | Runs |
|---|---|---|
| pre-commit | <30s | L1 ‖ G1 (parallel) |
| pre-push | <3min | L2 ‖ G2 (parallel) |
| on-demand | — | L3 |
```

**Verification:** Read CLAUDE.md and docs/README.md — information is accurate and consistent.

---

## Rollback Plan

Each commit is atomic and independently revertable:

- Commits 1-4: Safe additions, no existing behavior changed
- Commit 5: Revert restores old pre-commit (`bun run test:coverage && bun run lint`)
- Commit 6: Revert restores old pre-push (`bun run test && bun run lint && bun run test:e2e:api`)
- Commit 7: Documentation only, no runtime impact

## Verification Checklist

After all commits:

- [ ] `bun run typecheck` — 0 errors
- [ ] `bun run lint` — 0 errors/warnings
- [ ] `bun run lint:staged` — works on staged files only
- [ ] `bun run gate:security` — both scanners pass
- [ ] `bun run test:coverage` — 486 tests pass, ≥90% coverage
- [ ] `bun run test:e2e:api` — 146 tests pass
- [ ] `bun run test:e2e:bdd` — 5 specs pass (manual)
- [ ] `git commit` triggers parallel L1‖G1
- [ ] `git push` triggers parallel L2‖G2
- [ ] CLAUDE.md reflects new quality system
- [ ] docs/README.md indexes this document
