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
| **L3** System/E2E | Playwright user flows | on-demand | — |
| **G1** Static Analysis | `tsc --noEmit` + ESLint strict (`--max-warnings 0`), 0 error/warning | pre-commit (sequential, before L1) | <30s |
| **G2** Security | osv-scanner + gitleaks — **hard fail if tool missing** | pre-push (parallel with L2) | <30s |

### Scope of `tsc --noEmit`

The project `tsconfig.json` excludes `scripts/` and `e2e/` directories. G1's typecheck gate intentionally covers only `src/` — the application code that ships to production.

**What is NOT covered and why:**

- **`scripts/`** — Infrastructure glue (coverage gate, E2E runner, security gate). These files are small and change rarely. Runtime errors surface when the script is invoked, but **type errors will not** — they pass silently through `bun run`. The cost of maintaining a separate tsconfig for ~4 files outweighs the benefit.
- **`e2e/`** — Test harnesses with their own runtime assumptions (Playwright globals, custom BDD framework). Adding them to the main tsconfig would require type gymnastics (Playwright's global `expect`, custom `test()` signatures) for code that never ships.

**Note:** Bun does **not** perform type-checking at runtime — `bun run` transpiles and executes TypeScript without enforcing types. Type errors in `scripts/` and `e2e/` will only be caught by IDE tooling or manual `tsc` invocation, not by any automated gate. This is an accepted trade-off for this project's scale.

## Gap Analysis

| Item | Current | Target | Action |
|---|---|---|---|
| L1 Unit | ✅ 486 tests, 90% gate | ✅ No change | — |
| G1 tsc | ❌ No standalone typecheck | `tsc --noEmit` in pre-commit | Add `typecheck` script |
| G1 lint-staged | ❌ Full lint on every commit | Incremental lint on staged files, `--max-warnings 0` | Add lint-staged |
| G2 osv-scanner | ❌ Not installed | Dependency vulnerability scan, hard fail if missing | Install + configure |
| G2 gitleaks | ❌ Not installed | Secrets leak detection, hard fail if missing | Install + configure |
| Hook wiring | Sequential L1→G1 | Sequential G1→L1 (see rationale) | Rewrite hooks |
| Hook wiring | Sequential L1→L2→L3 | Parallel L2‖G2 | Rewrite hooks |
| Layer naming | ✅ `test:e2e:api` and `test:e2e:bdd` already exist | ✅ No change | — |
| CLAUDE.md | References old 4-tier | Update to new system | Sync documentation |

## Target Hooks Architecture

```
pre-commit (<30s)
├── G1: bun run typecheck && bun run lint:staged   (tsc + eslint on staged files)
└── L1: bun run test:coverage                      (unit tests + 90% gate)
    ↕ sequential: G1 first, then L1

pre-push (<3min)
├── L2: bun run test:e2e:api           (API E2E on port 17026)
└── G2: bun run gate:security          (osv-scanner + gitleaks)
    ↕ parallel

on-demand
└── L3: bun run test:e2e:bdd           (Playwright on port 27026)
```

### Why pre-commit is sequential, not parallel

lint-staged uses `eslint --max-warnings 0` (check-only, no `--fix`), so it does not modify files. However, running L1 tests and G1 lint in sequence provides a clearer failure narrative: if G1 fails, you see exactly which static analysis issue to fix without interleaved test output. The total budget (<30s) is comfortably met with sequential execution.

## File Modification Map

| File | Change | Reason |
|---|---|---|
| `package.json` | Add scripts: `typecheck`, `lint:staged`, `gate:security` | New quality gates |
| `package.json` | Add devDeps: `lint-staged` | Incremental lint |
| `eslint.config.mjs` | No change | Already strict via Next.js presets |
| `.lintstagedrc.json` | **New file** | lint-staged config (check-only, no --fix) |
| `scripts/gate-security.ts` | **New file** | G2 security gate runner (hard fail if tool missing) |
| `.husky/pre-commit` | Rewrite to sequential G1→L1 | New hook architecture |
| `.husky/pre-push` | Rewrite to parallel L2‖G2 | New hook architecture |
| `CLAUDE.md` | Update testing section | Sync documentation |
| `README.md` | Update "常用命令" and "测试体系" sections | Sync documentation (outdated test counts + old 3-tier model) |
| `docs/README.md` | Add this document (already done in prior commit) | Index maintenance |

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
    "*.{ts,tsx}": ["eslint --max-warnings 0"],
    "*.{js,mjs}": ["eslint --max-warnings 0"]
  }
  ```

**Design decisions:**
- **No `--fix`** — lint-staged is a gate, not an auto-formatter. Modifications during commit would introduce a mismatch between tested code and committed code.
- **`--max-warnings 0`** — ESLint exits 0 on warnings by default. This flag ensures any warning is a hard failure, enforcing the "0 error / 0 warning" contract.

**Verification:** Stage a `.ts` file, run `bun run lint:staged`, confirm only staged files are checked and any warning causes non-zero exit.

---

### Commit 3: `feat: add G2 security gate (osv-scanner + gitleaks)`

**Files:**
- `scripts/gate-security.ts` — new file: runs `osv-scanner` and `gitleaks` in parallel, reports results, exits non-zero on findings
- `package.json` — add `"gate:security": "bun run scripts/gate-security.ts"` to scripts

**Prerequisites:** Install tools globally:
```bash
brew install osv-scanner gitleaks
```

**Hard-fail behavior:** If either tool is not found in `$PATH`, the script exits non-zero immediately with an actionable error message:

```
❌ osv-scanner not found. Install: brew install osv-scanner
```

This is a personal project with a single developer. Every tool in the gate must be installed — there is no "collaborator without the tool" scenario. A gate that can be silently skipped is not a gate.

**Verification:**
- `bun run gate:security` passes (no known vulnerabilities or leaked secrets)
- Negative test — verify hard-fail by running with an empty PATH override:
  ```bash
  PATH=/usr/bin:/bin bun run gate:security
  ```
  This hides Homebrew binaries without touching the global install. The script should exit non-zero with an actionable "not found" message.

---

### Commit 4: `feat: rewrite pre-commit hook for sequential G1→L1`

**Files:**
- `.husky/pre-commit` — rewrite to:
  ```bash
  # G1: Static analysis (typecheck + lint on staged files)
  # L1: Unit tests + coverage gate
  # Sequential: G1 first to catch static issues before running tests

  bun run typecheck && bun run lint:staged && bun run test:coverage
  ```

**Verification:** Make a commit — G1 runs first, then L1. Commit blocked if either fails.

---

### Commit 5: `feat: rewrite pre-push hook for parallel L2‖G2`

**Files:**
- `.husky/pre-push` — rewrite to:
  ```bash
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

### Commit 6: `docs: update CLAUDE.md and README.md for quality system upgrade`

**Files:**
- `CLAUDE.md` — update "Four-Tier Testing" section to new "Quality System (L1+L2+L3+G1+G2)" with updated table, hook mapping, and port conventions
- `README.md` — update "常用命令" table (fix outdated test counts) and replace "测试体系" section with new quality system

**CLAUDE.md testing section update:**

Replace the current "Four-Tier Testing" section with:

```markdown
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
```

**README.md updates:**

Replace the command table under the `## 📋 常用命令` section with:

```markdown
| 命令 | 说明 |
|------|------|
| `bun dev` | 启动开发服务器 (端口 7026) |
| `bun run build` | 生产构建 |
| `bun start` | 启动生产服务器 |
| `bun test` | 运行单元测试 (486 tests) |
| `bun run test:coverage` | 单元测试 + 90% 覆盖率门禁 |
| `bun run test:e2e:api` | API E2E 测试 (146 tests, port 17026) |
| `bun run test:e2e:bdd` | Playwright E2E 测试 (5 specs, port 27026) |
| `bun run typecheck` | TypeScript 类型检查 |
| `bun run lint` | ESLint 检查 |
| `bun run gate:security` | 安全扫描 (osv-scanner + gitleaks) |
```

Replace the entire `## 🧪 测试体系` section (heading through the E2E paragraph) with:

```markdown
## 🧪 质量体系

三层测试 + 两道门控，通过 Husky Git hooks 自动执行：

| 层级 | 工具 | 触发时机 | 要求 |
|------|------|----------|------|
| L1 单元测试 | bun test | pre-commit | 90%+ 覆盖率，486 tests |
| L2 API E2E | BDD 自举测试 | pre-push | 146 tests 全部通过 |
| L3 系统 E2E | Playwright | 按需 | 5 specs 全部通过 |
| G1 静态分析 | tsc + ESLint | pre-commit | 0 错误 / 0 警告 |
| G2 安全扫描 | osv-scanner + gitleaks | pre-push | 0 漏洞 / 0 泄露 |

E2E 测试使用 `backy-test` 项目自举：上传真实数据 → 验证完整流程 → 清理。通过 `E2E_SKIP_AUTH=true` 在本地绕过 OAuth。
```

**Verification:** Read CLAUDE.md and README.md — information is accurate and consistent with this document.

---

## Rollback Plan

Each commit is atomic and independently revertable:

- Commits 1-3: Safe additions, no existing behavior changed
- Commit 4: Revert restores old pre-commit (`bun run test:coverage && bun run lint`)
- Commit 5: Revert restores old pre-push (`bun run test && bun run lint && bun run test:e2e:api`)
- Commit 6: Documentation only, no runtime impact

## Verification Checklist

After all commits:

- [ ] `bun run typecheck` — 0 errors
- [ ] `bun run lint` — 0 errors/warnings
- [ ] `bun run lint:staged` — works on staged files only, exits non-zero on any warning
- [ ] `bun run gate:security` — both scanners present and pass
- [ ] `bun run gate:security` (with tool removed) — hard fails, does not skip
- [ ] `bun run test:coverage` — 486 tests pass, ≥90% coverage
- [ ] `bun run test:e2e:api` — 146 tests pass
- [ ] `bun run test:e2e:bdd` — 5 specs pass (manual)
- [ ] `git commit` triggers sequential G1→L1
- [ ] `git push` triggers parallel L2‖G2
- [ ] CLAUDE.md reflects new quality system
- [ ] README.md reflects new quality system (test counts, command table, 质量体系 section)
