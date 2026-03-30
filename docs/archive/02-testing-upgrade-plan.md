# Backy - Testing Upgrade Plan

Upgrade from 3-tier testing to 4-tier testing architecture.

## Current State

| Layer | Status | Notes |
|---|---|---|
| L1 - UT | ✅ Complete | 34 test files, 421 tests, 93.9% functions / 96.4% lines, shared helpers in `src/__tests__/helpers.ts` |
| L2 - Lint | ✅ Complete | ESLint + next/core-web-vitals + typescript, pre-commit, zero errors |
| L3 - API E2E | ✅ Complete | 21 suites in `e2e/api/suites/`, 146 tests, 31 API route/method combos |
| L4 - BDD E2E | ✅ Complete | 5 Playwright specs, 17 tests, port 27017 |

## Target State

| Layer | Tool | Trigger | Gate |
|---|---|---|---|
| L1 - UT | bun test | pre-commit | 90%+ coverage |
| L2 - Lint | eslint | pre-commit | Zero errors/warnings |
| L3 - API E2E | custom runner (port 17017) | pre-push | 100% API routes |
| L4 - BDD E2E | Playwright (port 27017) | pre-push | Core user flows |

## Execution Plan

### Phase 1: Extract Shared Test Helpers ✅

Eliminate copy-paste across 8+ test files.

- [x] 1.1 Create `src/__tests__/helpers.ts` — unified `mockFetch()`, `d1Success()`, `d1Error()`, stubs, builders
- [x] 1.2 Migrate all 14 test files to import from shared helpers (~300 lines removed)
- [x] 1.3 Verify: `bun test` + `bun run test:coverage` pass

### Phase 2: Fill Missing API Route Unit Tests ✅

Ensure L1 coverage of all API routes.

- [x] 2.1 Audit existing tests vs API routes, identify 12 gaps
- [x] 2.2 Add UT for each missing route (86+ new tests)
- [x] 2.3 Verify: coverage 93.9% functions, 96.4% lines

### Phase 3: Modularize API E2E (L3) ✅

Split monolith `scripts/e2e-tests.ts` into `e2e/api/` modules.

- [x] 3.1 Create `e2e/api/` directory structure with `config.ts`, `framework.ts`, `helpers.ts`
- [x] 3.2 Extract 21 suites into individual files under `e2e/api/suites/`
- [x] 3.3 Create `e2e/api/runner.ts` that imports and runs all suites
- [x] 3.4 Update `scripts/run-e2e.ts` to import from `e2e/api/runner`
- [x] 3.5 Delete old `scripts/e2e-tests.ts` monolith (2012 lines)
- [x] 3.6 Verify: `bun run test:e2e:api` passes all 146 tests

### Phase 4: Add Playwright BDD E2E (L4) ✅

Introduce browser-level tests for core user flows.

- [x] 4.1 Install Playwright + configure `e2e/bdd/playwright.config.ts`
- [x] 4.2 Create `e2e/bdd/runner.ts` — starts dev server on port 27017, runs Playwright
- [x] 4.3 Write BDD specs for 5 core flows:
  - Dashboard renders with stat cards and charts
  - Project list, creation, and detail navigation
  - Backup list, search, and detail navigation
  - Manual upload dialog flow
  - Sidebar navigation + restore URL generation
- [x] 4.4 Add `test:e2e:bdd` script
- [x] 4.5 Verify: `bun run test:e2e:bdd` passes (15 passed, 2 skipped)

### Phase 5: Update Hooks & Documentation ✅

- [x] 5.1 Update `.husky/pre-push` to run `test:e2e:api` (L4 BDD runs on-demand only)
- [x] 5.2 Update `CLAUDE.md` testing section to reflect 4-tier architecture
- [x] 5.3 Add `test:e2e:api` and `test:e2e:bdd` scripts to `package.json`
- [x] 5.4 Verify: all tests pass
