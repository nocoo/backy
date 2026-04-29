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

- **formatBytes is duplicated**: `apps/web/src/lib/format.ts` has 5 size
  units (B/KB/MB/GB/TB), and `apps/web/src/components/charts/project-charts.tsx`
  has its own `formatBytes` with only 4 (B/KB/MB/GB). Tests pin the
  divergence (charts: '1048576 GB', dashboard: '1048576 TB' for the same
  input shape). Consolidating to a single `formatBytes` would prevent
  unit-list drift. Prod-code change, deferred.

- **previewBackupHandler dead branch**: the `if (!r2Response)` null-check
  on line 313 of `packages/api/src/handlers/backups.ts` is unreachable
  in practice — `await readR2Bytes(r2Response)` would throw on a null
  Response BEFORE the null-check fires. The `Failed to download preview
  file from storage` message is therefore never actually returned to a
  client; instead the outer catch returns `Failed to load preview`.
  Either delete the dead branch or restructure to actually catch the
  null-body case before readR2Bytes. Prod-code change, deferred.

- **Distinct error messages for same status across handlers**: Several
  handlers currently return generic 'Internal server error' on any 5xx
  while others surface specific 'Failed to X' messages. The mix is
  inconsistent (uploadBackup → generic; deleteBackup → specific). Either
  unify to specific (better for ops) or unify to generic (better for
  no-info-leak). Currently all body-coverage tests pin whichever the
  handler currently does, so a unification refactor would need to update
  the tests in parallel.

- **Heuristic: detect tests with single-property body checks (partial
  envelope)**: scan-weak-tests.ts could grow a heuristic for
  `expect(body.X).toBe(Y)` where there's no following `toEqual(body)`
  that pins the full shape. Risky for false positives (some tests
  legitimately check one field) but could surface 30+ partial assertions
  scattered across handler tests. Defer until the existing 7 heuristics
  start hitting 0 across the board (they currently are).

- **Bug: `toResponse({kind:"empty",headers:...})` drops headers**:
  `apps/worker/src/lib/handler-response.ts` line ~30 spreads `r.headers`
  directly into the `ResponseInit` object instead of into a nested
  `headers` property (json/bytes/text correctly do
  `headers: { ..., ...r.headers }`). The empty-case headers are silently
  dropped — Response() ignores the unrecognized ResponseInit keys.
  Currently no caller uses `empty(status, headers)` so the bug is
  latent, but webhookHeadHandler returning `empty(200, {"X-Project-Name":
  "..."})` is the obvious risk vector. Fix: change line ~30 to
  `new Response(null, { status: r.status, headers: { ...(r.headers ?? {}) } })`.
  Tests in handler-response.test.ts now pin the buggy behavior — fix
  must update both at once.

- **Security: `isLocalhost` uses startsWith — vulnerable to
  `localhost.evil.com`**: `apps/worker/src/middleware/is-localhost.ts`
  uses `host.startsWith("localhost")` and `startsWith("127.0.0.1")`,
  which means an attacker-controlled `Host: localhost.evil.com` header
  would be treated as local. The cf-edge check (`c.req.raw.cf`) is the
  practical mitigation in CF Worker deploys (the `cf` field is only set
  when traffic actually came through CF). If anyone ever wires this
  worker behind a non-CF reverse proxy, the bypass becomes
  exploitable. Fix: change to either exact-match (`host === "localhost"`
  or `host.startsWith("localhost:")` for port suffix) or use
  `URL.hostname` parsing. Test currently pins the BUG behavior so a fix
  forces both updates. Prod-code change, deferred.
