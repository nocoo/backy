# Backy - Testing Upgrade Plan

Upgrade from 3-tier testing to 4-tier testing architecture.

## Current State

| Layer | Status | Notes |
|---|---|---|
| L1 - UT | Partial | 22 test files, 90%+ coverage gate, but test helpers duplicated across ~8 files; some API routes missing UT |
| L2 - Lint | OK | ESLint + next/core-web-vitals + typescript, pre-commit |
| L3 - API E2E | Partial | 18 suites in monolith `scripts/e2e-tests.ts`, mixed with L4 concerns |
| L4 - BDD E2E | Missing | No Playwright, no browser-level tests |

## Target State

| Layer | Tool | Trigger | Gate |
|---|---|---|---|
| L1 - UT | bun test | pre-commit | 90%+ coverage |
| L2 - Lint | eslint | pre-commit | Zero errors/warnings |
| L3 - API E2E | custom runner (port 17026) | pre-push | 100% API routes |
| L4 - BDD E2E | Playwright (port 27026) | pre-push | Core user flows |

## Execution Plan

### Phase 1: Extract Shared Test Helpers

Eliminate copy-paste across 8+ test files.

- [ ] 1.1 Create `src/__tests__/helpers/mock-fetch.ts` — unified `mockFetch()`, `d1Success()`, `d1Error()`, `d1Empty()`
- [ ] 1.2 Migrate all test files to import from shared helpers
- [ ] 1.3 Verify: `bun test` + `bun run test:coverage` pass

### Phase 2: Fill Missing API Route Unit Tests

Ensure L1 coverage of all API routes.

- [ ] 2.1 Audit existing tests vs API routes, identify gaps
- [ ] 2.2 Add UT for each missing route
- [ ] 2.3 Verify: `bun run test:coverage` still ≥ 90%

### Phase 3: Modularize API E2E (L3)

Split monolith `scripts/e2e-tests.ts` into `e2e/api/` modules.

- [ ] 3.1 Create `e2e/api/` directory structure with shared utils
- [ ] 3.2 Extract each suite into its own file under `e2e/api/suites/`
- [ ] 3.3 Create `e2e/api/runner.ts` that imports and runs all suites
- [ ] 3.4 Add `test:e2e:api` script pointing to new runner
- [ ] 3.5 Remove old `scripts/e2e-tests.ts`, update `scripts/run-e2e.ts` to use new runner
- [ ] 3.6 Verify: `bun run test:e2e:api` passes all 18 suites

### Phase 4: Add Playwright BDD E2E (L4)

Introduce browser-level tests for core user flows.

- [ ] 4.1 Install Playwright + configure `e2e/bdd/playwright.config.ts`
- [ ] 4.2 Create `e2e/bdd/runner.ts` — starts dev server on port 27026, runs Playwright
- [ ] 4.3 Write BDD specs for core flows:
  - Dashboard reachable after auth bypass
  - Project list visible
  - Backup detail + preview navigation
  - Manual upload flow
  - Restore URL generation
- [ ] 4.4 Add `test:e2e:bdd` script
- [ ] 4.5 Verify: `bun run test:e2e:bdd` passes

### Phase 5: Update Hooks & Documentation

- [ ] 5.1 Update `.husky/pre-push` to run `test:e2e:api && test:e2e:bdd`
- [ ] 5.2 Update `CLAUDE.md` testing section to reflect 4-tier architecture
- [ ] 5.3 Update `package.json` scripts (`test:e2e` runs both L3 + L4)
- [ ] 5.4 Verify: full pre-push hook passes end-to-end
