# Autoresearch ideas backlog (UT quality)

Most of the original backlog is DONE (auth-render fragility fixed, surface
tests swept, generatePageNumbers de-duplicated, scanner extended). What's
left is genuinely deeper work that wasn't tackled this round:

- **api/handlers/* test boilerplate** (~2900 lines across 11 files) uses
  the same `let mockX = async () => ...` + `vi.doMock` pattern. Extract a
  shared `makeStubbedDb<T>()` helper that auto-wires every db function to
  a re-assignable mock. Maintainability win, not perf.

- **lib-coverage.test.ts > window.location.reload on ApiError(401)** is the
  only test that needs happy-dom in apps/web. Refactoring `RequireAuth` to
  expose a pure `shouldReload(error: unknown): boolean` helper would let
  this test go straight against the helper (no DOM mount, no
  @testing-library/react). Saves ~12ms + lets web's vitest env switch to
  `node` (eliminating happy-dom init entirely, ~85 ms of CPU time, though
  the wall-clock saving is bounded by the parallel-max). Off-limits in
  this session because it touches prod code; revisit if/when prod scope
  opens up.

- **vitest projects mode at the repo root** would amortize CLI startup
  across the four workspaces. Requires installing `vitest` as a root
  devDependency (currently lives only in workspace packages); declined to
  avoid a new top-level dep.

- **`pages/backups.tsx` duplicates `lib/pagination.ts`'s
  `generatePageNumbers`** byte-for-byte. The duplicate page-resident
  export is dead now that backups.test.ts targets the lib version.
  Deleting the dup would shrink web's bundle and remove one fragility
  vector \u2014 prod-code change, deferred.

- **Net guard for apps/web vitest setup**. Adding the same beforeEach
  `globalThis.fetch = NET_GUARD` would require refactoring
  `auth-render.test.ts` and `api.test.ts` (both capture `realFetch` at
  module-load time and restore to it). Worthwhile when those two tests
  get a proper `beforeEach`-based fetch lifecycle.
