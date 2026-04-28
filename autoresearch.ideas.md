# Autoresearch ideas backlog (UT quality)

- **Fix auth-render.test.ts loading-shim fragility**: With `isolate:false` the
  test "renders the loading shim while session is undetermined" depends on SWR
  module-init order set up by *another* test file's transitive `useMe` import.
  Add `vi.doMock("../lib/useMe", () => ({ useMe: () => ({ ..., isLoading:
  true }) }))` before the test, or clear the SWR cache. Once stable, can
  delete projects.test.ts's surface tests + heavy imports for ~40ms web speedup
  and -7 weak tests.

- **Sweep "X is a function component" surface tests** across web/__tests__:
  `auth.test.ts` (2), `backups.test.ts` (3), `layout.test.ts` (3),
  `logs.test.ts` (2), `dashboard.test.ts` (1), `charts.test.ts` (1).
  TypeScript already enforces export shape; these only force heavy module
  imports. Replace with real behavioral assertions or delete. Blocked on
  the auth-render fragility above (same root cause: shared module state).

- **Consolidate duplicated `formatBytes` / `generatePageNumbers` tests**:
  same function tested in dashboard.test.ts AND charts.test.ts (formatBytes),
  backups.test.ts AND logs.test.ts (generatePageNumbers). Pick one home.

- **api/handlers/* test boilerplate**: 2886 lines across 11 handler tests
  with repeated mock setup. Extract a `makeMockCtx()` helper to cut LOC and
  avoid drift; not a perf win but a meaningfulness/maintainability win.

- **lib-coverage.test.ts > triggers window.location.reload on ApiError(401)**
  is the slowest single web test (~12ms). Uses `@testing-library/react` to
  mount a component just to verify `window.location.reload` was called.
  Replace with a direct unit test of the redirect branch (no DOM mount).

- **scan-weak-tests heuristic**: catch `expect(X).toBeInstanceOf(Function)`
  and `expect(X).not.toBeNull()` patterns; right now only `typeof toBe(...)`
  + `toBeDefined/Truthy` are flagged.
