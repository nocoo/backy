# Retrospective

Accident narratives for this repo.

Routing: narrative stays here. A project-specific rule that will recur may become one line in `CLAUDE.md`. Cross-project lessons go to nmem or a global rule. If it can be checked by a machine, add a hook or test instead of prose.

## TypeScript 7 + Biome

- **What:** typescript-eslint broke on TS 7 (no classic Compiler API).
- **Why:** TS 7 removed `lib/typescript.js` surfaces those plugins used.
- **Follow-up:** Biome only; keep formatter off during large migrations.

## AWS SDK v3 Body is not ReadableStream

- **What:** Preview/extract 500s reading S3 `Body` as a Web `ReadableStream`.
- **Why:** `GetObject` body is `SdkStreamMixin`.
- **Follow-up:** `transformToByteArray()` / `transformToString()`.

## Bun fetch mock needs preconnect

- **What:** Mocking `globalThis.fetch` failed types.
- **Why:** Bun’s `typeof fetch` includes `preconnect`.
- **Follow-up:** assign `fn.preconnect = () => {}` on the mock.

## E2E self-bootstrap

- **What:** Worker E2E needed a known project without hitting prod.
- **Why:** Auth and empty D1 otherwise block the suite.
- **Follow-up:** local `--persist-to`, `_test_marker`, `E2E_SKIP_AUTH`, seed endpoint.

## D1 7429 timeout

- **What:** Simple INSERTs returned D1 HTTP 7429 and webhook 500s.
- **Why:** Transient D1 storage timeout.
- **Follow-up:** retry with backoff in the D1 client.

## Schema indexes vs ALTER TABLE

- **What:** Existing DBs failed `no such column` on init.
- **Why:** Indexes in `SCHEMA_SQL` referenced columns added later.
- **Follow-up:** create those indexes after migrations.

## Next.js dev lock

- **What:** Parallel Next dev servers fought `.next/dev/lock`.
- **Why:** Same project dir, different ports still share the lock.
- **Follow-up:** E2E always starts a fresh server; clean stale locks. (Legacy Next path.)

## Bun mock.module is global

- **What:** One file’s `mock.module` broke another file’s real implementation.
- **Why:** Bun module mocks are process-wide and irreversible.
- **Follow-up:** never `mock.module` low-level db/r2 modules.

## osv-scanner warn-only

- **What:** Known vulns still pushed.
- **Why:** exit 1 was treated as warn.
- **Follow-up:** G2 hard-fail; pin via `osv-scanner.toml` with expiry.

## lint-staged --fix

- **What:** Committed code differed from tested code.
- **Why:** `--fix` rewrote the tree during the hook.
- **Follow-up:** check-only in hooks.

## Tag push --no-verify

- **What:** Tag pre-push re-ran L2 and flaked on port contention.
- **Why:** Code was already gated on the branch push.
- **Follow-up:** tag-only pushes may skip hooks.

## Decompression bomb

- **What:** `gunzipAsync(buffer)` could explode memory.
- **Why:** Size check ran after full inflate.
- **Follow-up:** streaming gunzip with byte cap.

## Sensitive fields at API boundary

- **What:** `SELECT *` leaked columns on API responses.
- **Why:** no allowlist at the boundary.
- **Follow-up:** `sanitizeProject()` allowlist.

## x-forwarded-host

- **What:** Credential URLs used untrusted `x-forwarded-host`.
- **Why:** host header was not allowlisted.
- **Follow-up:** validate against `ALLOWED_HOSTS` in `hosts.ts`.

## SSRF CIDR list

- **What:** Blocklist missed CGN, TEST-NET, IPv6 docs ranges.
- **Why:** only six common private ranges.
- **Follow-up:** full RFC-reserved coverage in `ip.ts`.

## Monorepo .env location

- **What:** After moving the app under `apps/web`, 80 tests saw empty env.
- **Why:** Bun loads `.env*` from cwd.
- **Follow-up:** env files live next to the consuming workspace.

## lint-staged dormant rules

- **What:** Bulk rename flagged 17 old react-hooks errors.
- **Why:** lint-staged only lints touched paths.
- **Follow-up:** keep structural commits focused; don’t mix lint upgrades.

## ESLint plugin clash

- **What:** `tseslint.configs.strict` collided with `eslint-config-next`.
- **Why:** both register `@typescript-eslint`.
- **Follow-up:** historical; lint is Biome now.

## vite emptyOutDir deletes gitignore

- **What:** `vite build` wiped `apps/worker/static/.gitignore`.
- **Why:** `emptyOutDir: true` deletes dotfiles.
- **Follow-up:** re-emit gitignore after vite.
