# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.8.2] - 2026-05-05

### Added
- Sync NEXT_PUBLIC_APP_VERSION in release script
- Add test:e2e:bdd runner script
- Add gate:pages static coverage check
- Add logs BDD specs (/logs, /cron-logs)
- Add backups BDD specs (/backups, /backups/:id)
- Add projects BDD specs (/projects, /projects/new, /projects/:id)
- Add dashboard BDD spec (/)
- Add Playwright BDD config and fixtures
- Add gate:routes static coverage check
- Add webhook E2E tests (3 routes)
- Add restore E2E test (1 route)
- Add db E2E tests (3 routes)
- Add live/ip-info/me E2E tests (3 routes)
- Add stats E2E tests (2 routes)
- Add logs E2E tests (4 routes)
- Add cron E2E tests (2 routes)
- Add backups E2E tests (9 routes)
- Add categories E2E tests (5 routes)
- Add projects E2E tests (7 routes)
- Add shared E2E config module
- Add test:e2e and test:e2e:api commands
- Add L2 API E2E test runner and basic tests
- Add _test_marker for E2E database isolation
- Accept ?token= query param alongside Bearer header
- Port Logs pages (D.9) — webhook logs + cron logs
- Port Backups pages (D.8) — list, detail + json-tree-viewer
- Port Projects pages (D.7) — list, new, detail + components
- Port Dashboard page (D.6)
- Port chart components (D.5) — activity, cron, project bars
- Port layout components (D.4) — sidebar, app-shell, theme toggle, breadcrumbs
- Port shadcn/ui primitives + cn helper (Wave D.3)
- Api client + useMe + RequireAuth + AppLayout (Wave D.2)
- Scaffold Vite SPA (Wave D.1)
- Unit tests + coverage gate (Wave C.6)
- Wire all @backy/api handlers + scheduled() cron (Wave C.4+C.5)
- Types + Access auth + RuntimeContext middleware (Wave C.3)
- D1 + R2 binding adapters for Cloudflare Worker host (Wave C.2)

### Changed
- Fix contradictory E2E description
- Update test isolation references for --local mode
- Replace --env test with --local --persist-to
- Add root vitest config aggregating workspace test suites
- Add vitest and @vitest/coverage-v8 as root devDependencies
- Make TGZ header-bomb test deterministically cover the guard
- Mark untestable race-condition branches with v8 ignore
- Ratchet coverage thresholds to 95% for cli/web/worker
- Fix overstated coverage claim in Wave D and checklist
- Mark Wave D complete — all thresholds at 95%+
- Add branch tests for version.ts/api.ts, ratchet branches to 95%
- Add webhook POST auth-pass test, ratchet funcs to 95%
- Mark Wave D as partial with remaining ratchet items
- Mark Wave D complete in doc 08
- Ratchet apps/web coverage to 98%
- Ratchet apps/worker coverage to 95%
- Ratchet packages/api coverage to 95%
- Record Wave C fix commit in 08 coverage gates doc
- Mark Wave C complete in doc 08
- Add version verification to release workflow
- Mark Wave B complete in doc 08
- Enable L2 and L3 in CI workflow
- Wire gate:routes and gate:pages to pre-commit
- Add doc 07 and 08 to README index
- Update Wave A completion with fix commit
- Mark Wave A complete in doc 08
- Fix HTML title language to match UI (backy - AI Backup Service)
- 234-experiment session wrap-up (test_count 688 +6.2%; api 95.63% stmts / 91.66% branches)
- Webhook.test: ADD 3 branch tests (HEAD/GET non-Error catches + POST empty file.name/.type defaults)
- Webhook.test: ADD 3 non-Error-throw tests covering instanceof Error ?: fallback branches (lines 349, 384, 419)
- D1-rest-adapter.test: NEW file, 14 tests covering retry matrix + UNIQUE-constraint detection + baseUrl/cred branches
- Extractors.test: ADD tar-parse-error test (covers extract.on(error) handler with gunzipped non-tar bytes)
- Extractors.test: ADD ZIP metadata-bomb defense test (overwrites declared uncompressedSize via CD-header byte surgery)
- Extractors.test: ADD TGZ streaming-gunzip bomb-defense test (covers MAX_DECOMPRESSED_SIZE overflow)
- 228-experiment milestone (test_count 665, +2.6% over baseline; api branches 85.24%\u219287.38%)
- Logs.test: ADD page/pageSize fallback test (covers parseInt-NaN || N branches)
- Projects.test: ADD 3 prompt-builder branch tests (plural hours, header (not set), webhook (not set))
- Hosts.test: ADD string-overload test (covers typeof-string branch in isAllowedHost)
- Access-auth.test: REVERT JWT-success vi.mock(jose) tests (flaky under contention)
- Document worker workspace contention flake post-#214
- Url.test: ADD 2 allowlist edge-case tests (malformed-URL + malformed-entry catch arms)
- Url.test: ADD 3 tests covering IPv4/IPv6 literal safe paths + No-DNS-records branch
- Live.test: ADD 2 tests (R2 non-Error + uptime null) closes live.ts to 100%
- Logs.test: ADD all-comma excludeProjectIds test (covers splitCsv empty-after-filter branch)
- Hosts.test: ADD isAllowedHost(env)-only test (covers ?? '' fallback)
- Ip-info.test: ADD ECHO_API_KEY-unset test (covers ?? '' fallback)
- Me-routes.test: NEW direct unit test (closes me.ts to 100% via mount-without-middleware)
- Routes.test: ADD cron-trigger no-auth-header test (covers ?? null branch in cron.ts route)
- Access-auth.test: ADD JWKS cache-hit test (closes line 30 coverage)
- Access-auth.test: ADD JWT-verified-success path coverage via vi.hoisted toggle
- 213-experiment final coverage snapshot (worker branches 91% \u2192 95.89%)
- Ideas backlog (access-auth JWT-verified path coverage gap)
- 213-experiment milestone (state notes deduplicated; coverage 85.24% \u2192 85.58% branches)
- Categories.test: ADD partial-update-without-name test (covers ?? fallback)
- Webhook-logs.test: ADD filters-by-errorCode test (closes lines 180-181 coverage)
- 211-experiment marker
- Webhook-logs.test: tighten 2 missed excludeProjectIds toContain to toEqual
- 210-experiment milestone (ctx.ts 100% statements; 5 prod bugs surfaced)
- Ctx.test: ADD comprehensive pickEnv test (closes ctx.ts to 100% statements)
- Ctx.test: ADD NEXT_PUBLIC_APP_VERSION forwarding test (closes ctx.ts coverage gap)
- 208-experiment milestone (2 misnamed tests fixed in this session)
- Routes.test: rename misleading me-401 test (was always asserting 500)
- Ideas backlog (enforceIpRestriction dead code)
- 207-experiment milestone (worker coverage 91% \u2192 93.83% branches)
- Routes.test: ADD malformed-JSON tests for PUT /api/categories+/api/projects (completes catch-arrow matrix)
- 205-experiment milestone (closing apps/worker route coverage gaps)
- Routes.test: ADD malformed-JSON test for /api/projects (symmetric to categories)
- Routes.test: ADD malformed-JSON test for /api/categories (covers catch arrow)
- Routes.test: ADD webhook environment-query test (closes routes/webhook.ts coverage gap)
- 202-experiment milestone (closing worker routes coverage gap)
- Routes.test: ADD backups query-param test (closes routes/backups.ts coverage gap)
- Projects.test: tighten create-201 to verify positional-args call-shape
- 200-experiment milestone (round number wrap-up)
- Categories.test: tighten create-201 to verify parsed-input forwarding
- 199-experiment milestone (RequireAuth no-children-leak + ip-info default-fetcher contracts)
- Auth-render.test: tighten loading-state to assert no children-leak
- Auth-render.test: tighten renders-children to assert no wrapper-shell leak
- Ip-info.test: tighten default-fetcher to pin URL+headers+body contracts
- 196-experiment milestone (cron shouldTrigger both branches covered)
- Cron.test: ADD real not-due-this-hour test using fake timers (closes coverage gap)
- Cron.test: rename misleading 'not due this hour' to 'invalid interval' (documents actual branch)
- 194-experiment milestone (cron no-retry contract symmetry across 4 failure paths)
- Cron.test: tighten one-shot-fetch-throw to verify no-retry; full no-retry contract symmetry
- Cron.test: tighten one-shot-failed-5xx to verify no-retry contract
- Cron.test: tighten counts-fetch-throw to verify no-retry contract
- Cron.test: tighten counts-non-2xx to verify no-retry (fetchCount=1) contract
- 190-experiment milestone (cron URL+method+header forwarding contracts pinned)
- Cron.test: tighten one-shot-success to verify POST method
- Cron.test: tighten triggers-success to verify POST method
- Cron.test: tighten one-shot-success to verify outbound URL targeting
- Cron.test: tighten triggers-success to verify outbound URL targeting
- 186-experiment milestone (state notes refresh)
- Ip-info.test: ADD 503 not-configured test (covers previously-untested path)
- 185-experiment milestone (cron auth-header forwarding contracts pinned)
- Cron.test: tighten one-shot-success to verify outbound auth-header forwarding
- Cron.test: tighten triggers-successfully to verify outbound auth-header forwarding
- 183-experiment milestone (added isLocalhost vuln + state notes)
- Is-localhost.test: ADD IPv4-form 127.0.0.1.evil.com vulnerability test
- Is-localhost.test: ADD security test surfacing startsWith vulnerability
- Access-auth.test: ADD 2 security tests for E2E_SKIP_AUTH exact-string bypass contract
- 180-experiment milestone (state notes refresh; deduplicated)
- Categories.test: tighten last list-500 status-only test (full body-coverage achieved)
- Cron.test: ADD .not.toHaveProperty(results) for omit-when-empty contract documentation
- Logs.test: tighten listWebhookLogs 200-default to verbatim pass-through
- Db.test: tighten dbInit-500 to pin generic Schema-initialization-failed body (no error.message leak)
- Db.test: tighten seed-403 to pin no-info-leak Forbidden message
- Projects.test: tighten prompt 200 to verify project-name interpolation + no-extras body shape
- Unify HTML title to "backy - AI 备份服务"
- Handler-response.test: ADD bytes-with-extra-headers test (covers Content-Disposition contract)
- Handler-response.test: ADD user-content-type-wins test (spread-order contract)
- Storage.test: tighten generatePreviewKey auto-timestamp to full-shape regex
- 170-experiment milestone (state notes refresh; 100% body-coverage achieved)
- Categories.test: tighten 3 500-status-only tests; categories handler 100% body-coverage
- Handler-response.test: ADD empty-with-headers test (surfaces real toResponse() bug, logged in ideas)
- Projects.test: tighten updateProject 200 to assert sanitization contract (no webhook_token leak)
- Projects.test: tighten 2 updateProject 400 tests (invalid-CIDR + unsafe-webhook bodies)
- Projects.test: tighten last 2 404-status-only tests; projects handler 100% body-coverage
- Ideas backlog refresh (distinct-error consistency, partial-envelope heuristic)
- Restore.test: tighten last 500-status-only test; restoreHandler 100% body-coverage
- Restore.test: consolidate 5 200-presigned property checks into full envelope toEqual
- Webhook.test: consolidate environment-filter test (full envelope + forwarded-options contract)
- Webhook.test: consolidate 4 webhookGet body property checks into full envelope toEqual
- Webhook-logs.test: tighten 2 console.error assertions to pin prefix string (log-aggregation contract)
- Db.test: tighten 2 seed-branch toMatchObject to full toEqual (pin TEST_PROJECT id+token)
- Id.test: tighten URL-safe-chars regex to also pin length (defense-in-depth)
- Access-auth.test: tighten 6 public-path tests to verify reached-downstream contract
- Cli/index.test: tighten 4 toContain partial assertions to exact toBe placeholder strings
- Categories+live: tighten last 2 status-only tests; packages/api/handlers/* now 100% body-coverage
- Projects.test: tighten 8 500-status tests to distinct user-facing error messages
- Hosts.test: tighten 2 partial-membership tests to full Set + add positive complementary checks
- Webhook.test: tighten 2 201 success-path tests (zip key+contentType, senderIp surrounding context)
- Routes.test: tighten cron-trigger 200 to full envelope (documents omit-results-when-empty)
- Routes.test: tighten seed-test-project status-only to full TEST_PROJECT created envelope
- 150-experiment milestone (state notes refresh)
- Routes.test: tighten D1-propagate test to assert sanitizeProject integration contract
- Routes.test: tighten 5 webhook+ctx-env tests (HEAD empty-body + 401/404 body shapes)
- Routes.test: tighten 5 more status-only tests (204 No-Content body-empty contract)
- Routes.test: tighten 13 4xx tests; documents Hono missing-handler default-404 plain-text contract
- Routes.test: tighten 7 status-only 401/400/404/500 tests to full body shape
- Auth-render.test: consolidate 4 useMe-default property checks into single toMatchObject
- Access-auth.test: tighten 3 NOT-public tests to pin Access-misconfig body (proves matcher reached accessAuth)
- Access-auth.test: tighten 2 401 tests to pin no-info-leak Unauthorized contract
- Routes.test: tighten /api/live to full envelope toMatchObject (catches snake-case drift)
- Webhook.test: tighten 5 webhookPost 4xx/5xx tests; webhook handlers now 100% body-coverage on errors
- Webhook.test: tighten 6 webhookGet+Post 4xx/5xx tests with no-info-leak error contracts
- Webhook.test: tighten 4 status-only tests (HEAD-500 empty + GET 401/403/403 with no-info-leak msgs)
- Categories.test: consolidate 2 .toBeDefined into stronger toMatchObject (preserves test isolation)
- Backups.test: tighten 2 .toBeDefined to toMatchObject (documents application/zip archive contract)
- Sanitize.test: ADD positive allowlist test (catches future sensitive-field regressions)
- Stats.test: tighten 2 500-status tests to distinct error messages (full body-coverage)
- Refresh state notes (134 experiments, handlers/backups.ts 100% body-coverage)
- Backups.test: tighten 5 final status-only tests; handlers/backups.ts now 100% body-coverage
- Backups.test: tighten 5 extractBackup status-only tests (incl. templated size-limit reason)
- Backups.test: tighten 6 previewBackup status-only tests; discover dead null-body branch
- Backups.test: tighten 3 downloadBackup status-only tests (404 + 2x500 share generic error)
- Backups.test: tighten 400-invalid-env + 500-createBackup-throw (documents outer-catch generic-error contract)
- Backups.test: tighten 7 uploadBackup + deleteBackup status-only tests to body shape (incl. MAX_FILE_SIZE pin)
- Backups.test: tighten 4 status-only tests (batchDelete + getBackup-500) incl. R2-non-fatal contract
- Backups.test: tighten 4 batchDelete + list-500 status-only tests to full body shape (2 distinct error msgs)
- Webhook.test: tighten createBackup arg from 4 boolean-only checks to single toMatchObject with 3 extra fields
- Handlers/logs.test: tighten 3 more cron handler tests (listCron-500, deleteCron-204+kind, deleteCron-500) to full body shape
- Handlers/logs.test: tighten 5 status-only tests (deleteWebhook + listCron + 500s) to full body shape
- Dashboard.test: tighten formatBytes clamp to exact toBe('1048576 TB')
- Charts.test: tighten 2 regex matches to exact toBe (formatBytes clamp + getChartColor negative-fallback)
- Lib-coverage.test: tighten 2 pagination indexed-position checks to full toEqual arrays
- Storage.test: replace 2 .not.toContain with positive regex pinning dashes-only timestamp shape
- Extractors.test: tighten 'not size-limited' to positive exact reason (keep negative 'no limit' contract)
- Live.test: tighten sanitizes-ok from .not.toContain to exact toBe (positive sanitizer contract)
- Categories.test: tighten listCategories SQL toContain to full toBe + empty params toEqual
- Routes.test: tighten 2 toMatch(/i) regex assertions to full toEqual body envelopes
- Url.test: tighten 6 SSRF reason toContain to full toBe templated copy (incl. brackets-in-IPv6-host contract)
- Extractors.test: tighten 3 TGZ tests to full toBe reason (incl. parse-order contract: gunzip-before-tar)
- Extractors.test: tighten 7 partial reason toContain checks to full toBe exact user-facing copy
- Cron-logs.test: tighten 7 partial param toContain checks to exact toEqual arrays (pins binding order)
- Lib-coverage.test: tighten reload-on-401 to case-sensitive 'Redirecting to login\u2026' check
- Auth-render.test: tighten 4 toLowerCase().toContain checks to case-sensitive exact UI text
- Webhook-logs.test: tighten 5 more partial param toContain checks to exact toEqual arrays (pins binding order)
- Webhook-logs.test: tighten 4 partial param toContain checks to exact toEqual arrays
- Ctx.test: tighten env-key set-membership to full sorted toEqual (pins pickEnv allowlist contract)
- Db.test: tighten getTestMarker error-path to full {marker:null,error} envelope
- Db.test: tighten 4 handler tests (seed-500, seed-resets, getTestMarker x2) to full body shape
- Db.test: tighten 'seed creates' from partial body.action to full toEqual incl. projectId+webhookToken
- Categories handler tests: tighten 5 status-only tests (list/create/get) to body shape + Zod fieldErrors
- Projects.test: tighten updateProject 400-schema-violation to error envelope with failing field path
- 100-experiment milestone (state notes refresh)
- Projects.test: tighten createProject 400-invalid-input to error envelope shape with fieldErrors path
- Cron.test: tighten cronTriggerOneHandler 500-getProject-throws to body shape
- Cron.test: tighten 4 cronTriggerHandler error tests (500/401/401/500) to full body shape (no-info-leak contract on 401)
- Restore.test: tighten last 2 403 tests (IP-null + query-token-mismatch) to full body shape
- Restore.test: tighten 3 403 tests to pin no-info-leak error messages (security contract)
- Restore.test: tighten 3 status-only tests (401 no-auth, 401 not-Bearer, 404 missing) to full body shape
- Backups.test: tighten 2 getBackupHandler tests (200-found row pass-through + 404 error body)
- Backups.test: tighten 3 deleteBackupHandler tests (R2 deletes + body shape + non-fatal contract)
- Auth-render.test: tighten error-state to pin joined 'Failed to load session: boom' line
- Categories.test: tighten deleteCategory to full SQL toBe + params toEqual
- Categories.test: tighten updateCategory 'all fields' to full row+SQL+params (with updated_at consistency check)
- Categories.test: tighten getCategory to full result toEqual + full SQL toBe + params toEqual
- Refresh state notes after #71-#87 quality batch
- Restore.test: tighten 2 200-status tests (query-token + Bearer-precedence) to assert presign side effects
- Projects.test: tighten regenerateTokenHandler '200' to full body shape (no extra fields)
- Cron.test: tighten last 2 cronTriggerHandler tests (DNS-fail + thrown-fetch) to full counter shape
- Cron.test: tighten 4 cronTriggerHandler summary tests to full counter shape (catches mis-categorization)
- Ip-info.test: tighten 4 handler tests to full body shape (error messages + upstream pass-through)
- Live.test: tighten 2 liveCheckHandler tests to full body envelope (200 up-up + 503 d1-down isolation)
- Cron.test: tighten 2 cronTriggerOneHandler error-path tests (404+400) to full body shape
- Categories.test: tighten createCategory 'all fields' to full SQL toBe + params toEqual
- Cron.test: tighten 'failed when fetch throws' to full body shape (no responseCode field)
- Cron.test: tighten 2 cronTriggerOneHandler tests (success+fetch-fail) to full body shape with responseCode + raw error body
- Cron.test: tighten 2 cronTriggerOneHandler failure-path tests to assert the surfaced error message
- Stats.test: tighten 3 handler tests to full toEqual body (snake\u2192camel mapping + empty defaults + charts shape)
- Cron.test: tighten 2 cronTriggerHandler tests to full summary toEqual (total+triggered+skipped+failed)
- Db.test: fix 'seed verifies clean existing' fixture (name drift made it silently exercise 'reset' branch)
- Db.test: tighten dbInitHandler '200' to body shape ({ok:true, message})
- Projects.test: tighten 3 updateProjectHandler tests to capture+assert forwarded patch object
- Backups.test: tighten 2 extractBackupHandler '200' tests to verify side effects + body shape
- Refresh state notes after quality batch (#50-#70)
- Backups.test: tighten previewBackupHandler '200' to full body toEqual including parsed JSON
- Restore.test: fix presignDownload mock dropping ttl arg + tighten '200 url' to assert TTL forwarding
- Backups.test: tighten downloadBackupHandler '200' to assert ttl forwarding + body shape; fix adapter mock dropping ttl arg
- Backups.test: tighten batchDeleteBackupsHandler '200 success' to capture R2 deletes + assert body shape
- Backups.test: tighten 2 upload-handler 201 tests to capture R2 uploads (count + content-type + key prefix)
- Backups.test: tighten 3 listBackupsHandler status-only tests to positively assert forwarded args / clamp / fallback
- Logs.test (cron path): tighten '200 with valid status' to full toEqual on parsed filter
- Logs.test: tighten 'all filters parsed' from 6 partial checks to full toEqual on parsed filter object
- Projects.test: positively assert webhook_token IS exposed in create response (one-time disclosure) and IS NOT in get response (sanitization gate)
- Projects.test: tighten listProjectsHandler sanitization to full literal-shape toEqual
- Webhook.test: tighten recent_backups sanitization assertion to full toEqual on sanitized array
- Webhook-logs+cron-logs: tighten 2 paginated-list tests to full toEqual on mock fixture
- Categories.test: tighten listCategories from toHaveLength+id checks to full toEqual(mockData)
- R2-binding-adapter.test: tighten presignDownload spy from toHaveBeenCalledTimes to toHaveBeenCalledExactlyOnceWith
- Ctx.test: tighten presignDownload R2 URL to full SigV4 regex (was 2 toContain)
- Backups.test (web): tighten 3 generatePageNumbers tests to full toEqual on the deterministic array
- Projects.test: tighten 3 prompt-builder toContain assertions to specific markdown anchors
- Backups.test: tighten restoreCommandHandler 3 toContain to exact toBe equality
- Scan-weak-tests: detect vacuous union-narrow `if (X.kind === \"...\") { expect... }` without preceding kind guard
- Handler tests: add explicit r.kind assertion before union-narrowing if-blocks (11 spots in restore/backups/webhook/cron)
- Routes.test: tighten /db/init/marker from toHaveProperty to toEqual({marker:null})
- Storage.test: tighten 'auto-generates timestamp' to full-shape regex (was length+prefix+suffix triplet)
- Categories+sanitize tests: tighten 5 toBeDefined() to format/equality checks
- Routes.test: tighten 5 list-endpoint smoke tests with full toEqual body shape
- Refresh state with final session numbers
- Scan-weak-tests: strip comments + string contents before regex (avoids false positives from English `test`/`it` in comments)
- Refresh ideas backlog
- Storage.test: use fake timers for 'defaults to current time' (replaces \u00b11ms time-window assertion with exact equality)
- Worker setup: add net guard + dns mock (mirrors api safety net)
- Refresh state notes
- Api setup: add loud-failing globalThis.fetch net guard (defensive, prevents accidental real fetch escapes)
- Scan-weak-tests: detect vacuous try/catch (no throw guard before catch with expects)
- Api.test: fix vacuous-pass try/catch in ApiError text/json-parse branches (use rejects.toMatchObject)
- Categories.test: assert exact 21-char nanoid format on createCategory id (was .length>0)
- Routes.test: tighten last 2 webhook auth-precedence OR assertions to 401
- Routes.test: tighten 7 more OR-of-statuses to deterministic 401/404/400
- Routes.test: deterministic db/init + db/seed-test-project (was [200,500] OR)
- Routes.test: deterministic /api/live (200 + dependencies.{d1,r2}.up)
- Routes.test: deterministic stats/totals + stats/charts assertions (was [200,500] OR)
- Routes.test: replace flaky ip-info smoke (real .example DNS) with deterministic 503/400 assertions
- Hoist node:dns mock to setupFiles (fixes isolate:false module-cache race that left real DNS in the cache)
- Routes.test: explicit assertion on cron-success path; weak_tests \u2192 0
- Webhook-logs: assert exact error logged + non-throwing resolution (replace weak toHaveBeenCalled())
- Sweep surface tests + heavy page imports across backups/logs/dashboard/auth; harden TZ-stable assertions
- Trim layout.test.ts surface tests + heavy radix imports
- Vitest 4 migration: maxWorkers:1, isolate:false (top-level)
- Api+worker: pool=threads singleThread, isolate:false; benchmark: add warmup run
- Pool=threads singleThread, isolate:false
- Parallelize workspace test runs (& wait)
- 4 workspaces (web 12/75 + api 26/488 + worker 5/80 + cli 1/5 = 44 files / 648 cases)
- Gitignore wrangler state
- Scaffold UT quality session
- Update CLAUDE.md for local E2E architecture
- Add L2 API E2E to pre-push
- Simplify [env.test] for local-only E2E
- Standardize release workflow to dove template
- Pin accountId + explicit --env="" for wrangler
- Auto-deploy worker to Cloudflare on push-to-main
- Cover RequireAuth reload effect + pagination edge branches
- Migrate to vitest; wire vitest coverage into root G1 (M.4)
- Migrate to vitest + happy-dom (M.3)
- Migrate apps/worker to vitest 4 (M.2)
- Migrate packages/api to vitest 4 (M.1)
- Wire prod (backy) + test (backy-test) workers (E.2)
- Mark Wave E.1 ✅ — root scripts detached from web_legacy (E.1f)
- Sync CLAUDE.md + README.md to new Vite/Worker stack (E.1e)
- Refresh comment block and point osv-config at root (E.1d)
- Pre-push runs only G2 after legacy L2 detach (E.1c)
- Cut over root scripts from web_legacy to apps/web + apps/worker (E.1b)
- Relocate root-level tooling out of web_legacy (E.1a)
- Mark Wave D ✅ complete (D.1–D.12)
- Coverage gate ≥90% for src/lib/** (D.11)
- Wire apps/web into root scripts (D.10)
- Mark Wave D.1–D.3 complete
- Wire apps/worker into root scripts + mark Wave C ✅
- Scaffold Hono + Cloudflare Workers app (Wave C.1)
- Wave B — RuntimeContext DI for portable handlers
- Rename apps/web → apps/web_legacy, scaffold new apps/web + apps/worker
- Include /api/ip path in stubbed ECHO_API_URL
- Make ip-info url assertion env-independent
- Allowlist E2E test fixture token via .gitleaks.toml
- Add base-ci quality workflow (L1+G1+G2)

### Fixed
- Make wrangler.toml version sync fatal in release script
- Isolate BDD backup fixture and strengthen assertions
- Use role-based locators and add port-safety to BDD runner
- Align BDD specs with actual DOM and API contracts
- Align API tests with actual handler contracts
- Replace high-entropy mock webhook token with low-entropy placeholder
- Remove 5 unused eslint-disable-next-line directives in webhook.test.ts
- Adapt E2E runner and tests to backy API format
- Use gitleaks protect --staged in pre-commit context
- Add eslint config for apps/cli
- Add gate:secrets/gate:deps split and update hooks
- Correct logo path in README
- Correct collapsed logo padding to pl-6 per B02-2c
- Migrate shadcn L3 controls from bg-input/border-input to basalt tokens
- Declare tw-animate-css dep; CI install lacks repo-root hoist
- Declare typescript-eslint dep; CI install lacks repo-root hoist
- Inject root pkg version + rotate CF Access AUD
- Align fetch URLs with worker contracts + persist cleared description
- Wire R2 presign config into wrangler.toml
- Preserve legacy backups API contract
- Address Wave B review
- Point release script and root docs at apps/web_legacy
- Preload env stubs for apps/web unit tests on CI
- Declare @types/node devDep explicitly

### Removed
- Remove [env.test] from wrangler.toml
- Remove basic.test.ts (superseded by domain files)
- Ip-info.test: FIX 2 tests (delete env.X to actually trigger ?? '' fallback)
- Routes.test: ADD malformed-JSON test for DELETE /api/logs/webhook (catch-arrow coverage)
- Categories handler tests: tighten 5 update+delete tests (200/400/404) to body shape
- Projects.test: tighten 3 delete+regenerate tests (200/404) to full body shape
- Webhook.test: remove silent contentType default in adapter mock so tests can detect undefined pass-through
- Worker setup: drop unused node:dns mock; keep net guard only
- Routes.test: deterministic cron/trigger/:id 404 + DELETE /api/logs/{webhook,cron}
- Delete ui.test.ts radix-ui surface smoke (was slowest single web test, 159ms)
- Charts.test.ts: remove recharts surface assertions; tighten getChartColor negative test
- Deterministic auth-render loading test + simplify projects.test.ts (drop 7 surface tests)
- Url.test: stub node:dns to remove real DNS calls (stability)
- Delete trivial scaffold.test.ts (302ms surface-only test)
- Remove duplicate health.test.ts (covered by @backy/api)

## [1.8.1] - 2026-05-05

### Added
- Sync NEXT_PUBLIC_APP_VERSION in release script
- Add test:e2e:bdd runner script
- Add gate:pages static coverage check
- Add logs BDD specs (/logs, /cron-logs)
- Add backups BDD specs (/backups, /backups/:id)
- Add projects BDD specs (/projects, /projects/new, /projects/:id)
- Add dashboard BDD spec (/)
- Add Playwright BDD config and fixtures
- Add gate:routes static coverage check
- Add webhook E2E tests (3 routes)
- Add restore E2E test (1 route)
- Add db E2E tests (3 routes)
- Add live/ip-info/me E2E tests (3 routes)
- Add stats E2E tests (2 routes)
- Add logs E2E tests (4 routes)
- Add cron E2E tests (2 routes)
- Add backups E2E tests (9 routes)
- Add categories E2E tests (5 routes)
- Add projects E2E tests (7 routes)
- Add shared E2E config module
- Add test:e2e and test:e2e:api commands
- Add L2 API E2E test runner and basic tests
- Add _test_marker for E2E database isolation
- Accept ?token= query param alongside Bearer header
- Port Logs pages (D.9) — webhook logs + cron logs
- Port Backups pages (D.8) — list, detail + json-tree-viewer
- Port Projects pages (D.7) — list, new, detail + components
- Port Dashboard page (D.6)
- Port chart components (D.5) — activity, cron, project bars
- Port layout components (D.4) — sidebar, app-shell, theme toggle, breadcrumbs
- Port shadcn/ui primitives + cn helper (Wave D.3)
- Api client + useMe + RequireAuth + AppLayout (Wave D.2)
- Scaffold Vite SPA (Wave D.1)
- Unit tests + coverage gate (Wave C.6)
- Wire all @backy/api handlers + scheduled() cron (Wave C.4+C.5)
- Types + Access auth + RuntimeContext middleware (Wave C.3)
- D1 + R2 binding adapters for Cloudflare Worker host (Wave C.2)

### Changed
- Fix contradictory E2E description
- Update test isolation references for --local mode
- Replace --env test with --local --persist-to
- Add root vitest config aggregating workspace test suites
- Add vitest and @vitest/coverage-v8 as root devDependencies
- Make TGZ header-bomb test deterministically cover the guard
- Mark untestable race-condition branches with v8 ignore
- Ratchet coverage thresholds to 95% for cli/web/worker
- Fix overstated coverage claim in Wave D and checklist
- Mark Wave D complete — all thresholds at 95%+
- Add branch tests for version.ts/api.ts, ratchet branches to 95%
- Add webhook POST auth-pass test, ratchet funcs to 95%
- Mark Wave D as partial with remaining ratchet items
- Mark Wave D complete in doc 08
- Ratchet apps/web coverage to 98%
- Ratchet apps/worker coverage to 95%
- Ratchet packages/api coverage to 95%
- Record Wave C fix commit in 08 coverage gates doc
- Mark Wave C complete in doc 08
- Add version verification to release workflow
- Mark Wave B complete in doc 08
- Enable L2 and L3 in CI workflow
- Wire gate:routes and gate:pages to pre-commit
- Add doc 07 and 08 to README index
- Update Wave A completion with fix commit
- Mark Wave A complete in doc 08
- Fix HTML title language to match UI (backy - AI Backup Service)
- 234-experiment session wrap-up (test_count 688 +6.2%; api 95.63% stmts / 91.66% branches)
- Webhook.test: ADD 3 branch tests (HEAD/GET non-Error catches + POST empty file.name/.type defaults)
- Webhook.test: ADD 3 non-Error-throw tests covering instanceof Error ?: fallback branches (lines 349, 384, 419)
- D1-rest-adapter.test: NEW file, 14 tests covering retry matrix + UNIQUE-constraint detection + baseUrl/cred branches
- Extractors.test: ADD tar-parse-error test (covers extract.on(error) handler with gunzipped non-tar bytes)
- Extractors.test: ADD ZIP metadata-bomb defense test (overwrites declared uncompressedSize via CD-header byte surgery)
- Extractors.test: ADD TGZ streaming-gunzip bomb-defense test (covers MAX_DECOMPRESSED_SIZE overflow)
- 228-experiment milestone (test_count 665, +2.6% over baseline; api branches 85.24%\u219287.38%)
- Logs.test: ADD page/pageSize fallback test (covers parseInt-NaN || N branches)
- Projects.test: ADD 3 prompt-builder branch tests (plural hours, header (not set), webhook (not set))
- Hosts.test: ADD string-overload test (covers typeof-string branch in isAllowedHost)
- Access-auth.test: REVERT JWT-success vi.mock(jose) tests (flaky under contention)
- Document worker workspace contention flake post-#214
- Url.test: ADD 2 allowlist edge-case tests (malformed-URL + malformed-entry catch arms)
- Url.test: ADD 3 tests covering IPv4/IPv6 literal safe paths + No-DNS-records branch
- Live.test: ADD 2 tests (R2 non-Error + uptime null) closes live.ts to 100%
- Logs.test: ADD all-comma excludeProjectIds test (covers splitCsv empty-after-filter branch)
- Hosts.test: ADD isAllowedHost(env)-only test (covers ?? '' fallback)
- Ip-info.test: ADD ECHO_API_KEY-unset test (covers ?? '' fallback)
- Me-routes.test: NEW direct unit test (closes me.ts to 100% via mount-without-middleware)
- Routes.test: ADD cron-trigger no-auth-header test (covers ?? null branch in cron.ts route)
- Access-auth.test: ADD JWKS cache-hit test (closes line 30 coverage)
- Access-auth.test: ADD JWT-verified-success path coverage via vi.hoisted toggle
- 213-experiment final coverage snapshot (worker branches 91% \u2192 95.89%)
- Ideas backlog (access-auth JWT-verified path coverage gap)
- 213-experiment milestone (state notes deduplicated; coverage 85.24% \u2192 85.58% branches)
- Categories.test: ADD partial-update-without-name test (covers ?? fallback)
- Webhook-logs.test: ADD filters-by-errorCode test (closes lines 180-181 coverage)
- 211-experiment marker
- Webhook-logs.test: tighten 2 missed excludeProjectIds toContain to toEqual
- 210-experiment milestone (ctx.ts 100% statements; 5 prod bugs surfaced)
- Ctx.test: ADD comprehensive pickEnv test (closes ctx.ts to 100% statements)
- Ctx.test: ADD NEXT_PUBLIC_APP_VERSION forwarding test (closes ctx.ts coverage gap)
- 208-experiment milestone (2 misnamed tests fixed in this session)
- Routes.test: rename misleading me-401 test (was always asserting 500)
- Ideas backlog (enforceIpRestriction dead code)
- 207-experiment milestone (worker coverage 91% \u2192 93.83% branches)
- Routes.test: ADD malformed-JSON tests for PUT /api/categories+/api/projects (completes catch-arrow matrix)
- 205-experiment milestone (closing apps/worker route coverage gaps)
- Routes.test: ADD malformed-JSON test for /api/projects (symmetric to categories)
- Routes.test: ADD malformed-JSON test for /api/categories (covers catch arrow)
- Routes.test: ADD webhook environment-query test (closes routes/webhook.ts coverage gap)
- 202-experiment milestone (closing worker routes coverage gap)
- Routes.test: ADD backups query-param test (closes routes/backups.ts coverage gap)
- Projects.test: tighten create-201 to verify positional-args call-shape
- 200-experiment milestone (round number wrap-up)
- Categories.test: tighten create-201 to verify parsed-input forwarding
- 199-experiment milestone (RequireAuth no-children-leak + ip-info default-fetcher contracts)
- Auth-render.test: tighten loading-state to assert no children-leak
- Auth-render.test: tighten renders-children to assert no wrapper-shell leak
- Ip-info.test: tighten default-fetcher to pin URL+headers+body contracts
- 196-experiment milestone (cron shouldTrigger both branches covered)
- Cron.test: ADD real not-due-this-hour test using fake timers (closes coverage gap)
- Cron.test: rename misleading 'not due this hour' to 'invalid interval' (documents actual branch)
- 194-experiment milestone (cron no-retry contract symmetry across 4 failure paths)
- Cron.test: tighten one-shot-fetch-throw to verify no-retry; full no-retry contract symmetry
- Cron.test: tighten one-shot-failed-5xx to verify no-retry contract
- Cron.test: tighten counts-fetch-throw to verify no-retry contract
- Cron.test: tighten counts-non-2xx to verify no-retry (fetchCount=1) contract
- 190-experiment milestone (cron URL+method+header forwarding contracts pinned)
- Cron.test: tighten one-shot-success to verify POST method
- Cron.test: tighten triggers-success to verify POST method
- Cron.test: tighten one-shot-success to verify outbound URL targeting
- Cron.test: tighten triggers-success to verify outbound URL targeting
- 186-experiment milestone (state notes refresh)
- Ip-info.test: ADD 503 not-configured test (covers previously-untested path)
- 185-experiment milestone (cron auth-header forwarding contracts pinned)
- Cron.test: tighten one-shot-success to verify outbound auth-header forwarding
- Cron.test: tighten triggers-successfully to verify outbound auth-header forwarding
- 183-experiment milestone (added isLocalhost vuln + state notes)
- Is-localhost.test: ADD IPv4-form 127.0.0.1.evil.com vulnerability test
- Is-localhost.test: ADD security test surfacing startsWith vulnerability
- Access-auth.test: ADD 2 security tests for E2E_SKIP_AUTH exact-string bypass contract
- 180-experiment milestone (state notes refresh; deduplicated)
- Categories.test: tighten last list-500 status-only test (full body-coverage achieved)
- Cron.test: ADD .not.toHaveProperty(results) for omit-when-empty contract documentation
- Logs.test: tighten listWebhookLogs 200-default to verbatim pass-through
- Db.test: tighten dbInit-500 to pin generic Schema-initialization-failed body (no error.message leak)
- Db.test: tighten seed-403 to pin no-info-leak Forbidden message
- Projects.test: tighten prompt 200 to verify project-name interpolation + no-extras body shape
- Unify HTML title to "backy - AI 备份服务"
- Handler-response.test: ADD bytes-with-extra-headers test (covers Content-Disposition contract)
- Handler-response.test: ADD user-content-type-wins test (spread-order contract)
- Storage.test: tighten generatePreviewKey auto-timestamp to full-shape regex
- 170-experiment milestone (state notes refresh; 100% body-coverage achieved)
- Categories.test: tighten 3 500-status-only tests; categories handler 100% body-coverage
- Handler-response.test: ADD empty-with-headers test (surfaces real toResponse() bug, logged in ideas)
- Projects.test: tighten updateProject 200 to assert sanitization contract (no webhook_token leak)
- Projects.test: tighten 2 updateProject 400 tests (invalid-CIDR + unsafe-webhook bodies)
- Projects.test: tighten last 2 404-status-only tests; projects handler 100% body-coverage
- Ideas backlog refresh (distinct-error consistency, partial-envelope heuristic)
- Restore.test: tighten last 500-status-only test; restoreHandler 100% body-coverage
- Restore.test: consolidate 5 200-presigned property checks into full envelope toEqual
- Webhook.test: consolidate environment-filter test (full envelope + forwarded-options contract)
- Webhook.test: consolidate 4 webhookGet body property checks into full envelope toEqual
- Webhook-logs.test: tighten 2 console.error assertions to pin prefix string (log-aggregation contract)
- Db.test: tighten 2 seed-branch toMatchObject to full toEqual (pin TEST_PROJECT id+token)
- Id.test: tighten URL-safe-chars regex to also pin length (defense-in-depth)
- Access-auth.test: tighten 6 public-path tests to verify reached-downstream contract
- Cli/index.test: tighten 4 toContain partial assertions to exact toBe placeholder strings
- Categories+live: tighten last 2 status-only tests; packages/api/handlers/* now 100% body-coverage
- Projects.test: tighten 8 500-status tests to distinct user-facing error messages
- Hosts.test: tighten 2 partial-membership tests to full Set + add positive complementary checks
- Webhook.test: tighten 2 201 success-path tests (zip key+contentType, senderIp surrounding context)
- Routes.test: tighten cron-trigger 200 to full envelope (documents omit-results-when-empty)
- Routes.test: tighten seed-test-project status-only to full TEST_PROJECT created envelope
- 150-experiment milestone (state notes refresh)
- Routes.test: tighten D1-propagate test to assert sanitizeProject integration contract
- Routes.test: tighten 5 webhook+ctx-env tests (HEAD empty-body + 401/404 body shapes)
- Routes.test: tighten 5 more status-only tests (204 No-Content body-empty contract)
- Routes.test: tighten 13 4xx tests; documents Hono missing-handler default-404 plain-text contract
- Routes.test: tighten 7 status-only 401/400/404/500 tests to full body shape
- Auth-render.test: consolidate 4 useMe-default property checks into single toMatchObject
- Access-auth.test: tighten 3 NOT-public tests to pin Access-misconfig body (proves matcher reached accessAuth)
- Access-auth.test: tighten 2 401 tests to pin no-info-leak Unauthorized contract
- Routes.test: tighten /api/live to full envelope toMatchObject (catches snake-case drift)
- Webhook.test: tighten 5 webhookPost 4xx/5xx tests; webhook handlers now 100% body-coverage on errors
- Webhook.test: tighten 6 webhookGet+Post 4xx/5xx tests with no-info-leak error contracts
- Webhook.test: tighten 4 status-only tests (HEAD-500 empty + GET 401/403/403 with no-info-leak msgs)
- Categories.test: consolidate 2 .toBeDefined into stronger toMatchObject (preserves test isolation)
- Backups.test: tighten 2 .toBeDefined to toMatchObject (documents application/zip archive contract)
- Sanitize.test: ADD positive allowlist test (catches future sensitive-field regressions)
- Stats.test: tighten 2 500-status tests to distinct error messages (full body-coverage)
- Refresh state notes (134 experiments, handlers/backups.ts 100% body-coverage)
- Backups.test: tighten 5 final status-only tests; handlers/backups.ts now 100% body-coverage
- Backups.test: tighten 5 extractBackup status-only tests (incl. templated size-limit reason)
- Backups.test: tighten 6 previewBackup status-only tests; discover dead null-body branch
- Backups.test: tighten 3 downloadBackup status-only tests (404 + 2x500 share generic error)
- Backups.test: tighten 400-invalid-env + 500-createBackup-throw (documents outer-catch generic-error contract)
- Backups.test: tighten 7 uploadBackup + deleteBackup status-only tests to body shape (incl. MAX_FILE_SIZE pin)
- Backups.test: tighten 4 status-only tests (batchDelete + getBackup-500) incl. R2-non-fatal contract
- Backups.test: tighten 4 batchDelete + list-500 status-only tests to full body shape (2 distinct error msgs)
- Webhook.test: tighten createBackup arg from 4 boolean-only checks to single toMatchObject with 3 extra fields
- Handlers/logs.test: tighten 3 more cron handler tests (listCron-500, deleteCron-204+kind, deleteCron-500) to full body shape
- Handlers/logs.test: tighten 5 status-only tests (deleteWebhook + listCron + 500s) to full body shape
- Dashboard.test: tighten formatBytes clamp to exact toBe('1048576 TB')
- Charts.test: tighten 2 regex matches to exact toBe (formatBytes clamp + getChartColor negative-fallback)
- Lib-coverage.test: tighten 2 pagination indexed-position checks to full toEqual arrays
- Storage.test: replace 2 .not.toContain with positive regex pinning dashes-only timestamp shape
- Extractors.test: tighten 'not size-limited' to positive exact reason (keep negative 'no limit' contract)
- Live.test: tighten sanitizes-ok from .not.toContain to exact toBe (positive sanitizer contract)
- Categories.test: tighten listCategories SQL toContain to full toBe + empty params toEqual
- Routes.test: tighten 2 toMatch(/i) regex assertions to full toEqual body envelopes
- Url.test: tighten 6 SSRF reason toContain to full toBe templated copy (incl. brackets-in-IPv6-host contract)
- Extractors.test: tighten 3 TGZ tests to full toBe reason (incl. parse-order contract: gunzip-before-tar)
- Extractors.test: tighten 7 partial reason toContain checks to full toBe exact user-facing copy
- Cron-logs.test: tighten 7 partial param toContain checks to exact toEqual arrays (pins binding order)
- Lib-coverage.test: tighten reload-on-401 to case-sensitive 'Redirecting to login\u2026' check
- Auth-render.test: tighten 4 toLowerCase().toContain checks to case-sensitive exact UI text
- Webhook-logs.test: tighten 5 more partial param toContain checks to exact toEqual arrays (pins binding order)
- Webhook-logs.test: tighten 4 partial param toContain checks to exact toEqual arrays
- Ctx.test: tighten env-key set-membership to full sorted toEqual (pins pickEnv allowlist contract)
- Db.test: tighten getTestMarker error-path to full {marker:null,error} envelope
- Db.test: tighten 4 handler tests (seed-500, seed-resets, getTestMarker x2) to full body shape
- Db.test: tighten 'seed creates' from partial body.action to full toEqual incl. projectId+webhookToken
- Categories handler tests: tighten 5 status-only tests (list/create/get) to body shape + Zod fieldErrors
- Projects.test: tighten updateProject 400-schema-violation to error envelope with failing field path
- 100-experiment milestone (state notes refresh)
- Projects.test: tighten createProject 400-invalid-input to error envelope shape with fieldErrors path
- Cron.test: tighten cronTriggerOneHandler 500-getProject-throws to body shape
- Cron.test: tighten 4 cronTriggerHandler error tests (500/401/401/500) to full body shape (no-info-leak contract on 401)
- Restore.test: tighten last 2 403 tests (IP-null + query-token-mismatch) to full body shape
- Restore.test: tighten 3 403 tests to pin no-info-leak error messages (security contract)
- Restore.test: tighten 3 status-only tests (401 no-auth, 401 not-Bearer, 404 missing) to full body shape
- Backups.test: tighten 2 getBackupHandler tests (200-found row pass-through + 404 error body)
- Backups.test: tighten 3 deleteBackupHandler tests (R2 deletes + body shape + non-fatal contract)
- Auth-render.test: tighten error-state to pin joined 'Failed to load session: boom' line
- Categories.test: tighten deleteCategory to full SQL toBe + params toEqual
- Categories.test: tighten updateCategory 'all fields' to full row+SQL+params (with updated_at consistency check)
- Categories.test: tighten getCategory to full result toEqual + full SQL toBe + params toEqual
- Refresh state notes after #71-#87 quality batch
- Restore.test: tighten 2 200-status tests (query-token + Bearer-precedence) to assert presign side effects
- Projects.test: tighten regenerateTokenHandler '200' to full body shape (no extra fields)
- Cron.test: tighten last 2 cronTriggerHandler tests (DNS-fail + thrown-fetch) to full counter shape
- Cron.test: tighten 4 cronTriggerHandler summary tests to full counter shape (catches mis-categorization)
- Ip-info.test: tighten 4 handler tests to full body shape (error messages + upstream pass-through)
- Live.test: tighten 2 liveCheckHandler tests to full body envelope (200 up-up + 503 d1-down isolation)
- Cron.test: tighten 2 cronTriggerOneHandler error-path tests (404+400) to full body shape
- Categories.test: tighten createCategory 'all fields' to full SQL toBe + params toEqual
- Cron.test: tighten 'failed when fetch throws' to full body shape (no responseCode field)
- Cron.test: tighten 2 cronTriggerOneHandler tests (success+fetch-fail) to full body shape with responseCode + raw error body
- Cron.test: tighten 2 cronTriggerOneHandler failure-path tests to assert the surfaced error message
- Stats.test: tighten 3 handler tests to full toEqual body (snake\u2192camel mapping + empty defaults + charts shape)
- Cron.test: tighten 2 cronTriggerHandler tests to full summary toEqual (total+triggered+skipped+failed)
- Db.test: fix 'seed verifies clean existing' fixture (name drift made it silently exercise 'reset' branch)
- Db.test: tighten dbInitHandler '200' to body shape ({ok:true, message})
- Projects.test: tighten 3 updateProjectHandler tests to capture+assert forwarded patch object
- Backups.test: tighten 2 extractBackupHandler '200' tests to verify side effects + body shape
- Refresh state notes after quality batch (#50-#70)
- Backups.test: tighten previewBackupHandler '200' to full body toEqual including parsed JSON
- Restore.test: fix presignDownload mock dropping ttl arg + tighten '200 url' to assert TTL forwarding
- Backups.test: tighten downloadBackupHandler '200' to assert ttl forwarding + body shape; fix adapter mock dropping ttl arg
- Backups.test: tighten batchDeleteBackupsHandler '200 success' to capture R2 deletes + assert body shape
- Backups.test: tighten 2 upload-handler 201 tests to capture R2 uploads (count + content-type + key prefix)
- Backups.test: tighten 3 listBackupsHandler status-only tests to positively assert forwarded args / clamp / fallback
- Logs.test (cron path): tighten '200 with valid status' to full toEqual on parsed filter
- Logs.test: tighten 'all filters parsed' from 6 partial checks to full toEqual on parsed filter object
- Projects.test: positively assert webhook_token IS exposed in create response (one-time disclosure) and IS NOT in get response (sanitization gate)
- Projects.test: tighten listProjectsHandler sanitization to full literal-shape toEqual
- Webhook.test: tighten recent_backups sanitization assertion to full toEqual on sanitized array
- Webhook-logs+cron-logs: tighten 2 paginated-list tests to full toEqual on mock fixture
- Categories.test: tighten listCategories from toHaveLength+id checks to full toEqual(mockData)
- R2-binding-adapter.test: tighten presignDownload spy from toHaveBeenCalledTimes to toHaveBeenCalledExactlyOnceWith
- Ctx.test: tighten presignDownload R2 URL to full SigV4 regex (was 2 toContain)
- Backups.test (web): tighten 3 generatePageNumbers tests to full toEqual on the deterministic array
- Projects.test: tighten 3 prompt-builder toContain assertions to specific markdown anchors
- Backups.test: tighten restoreCommandHandler 3 toContain to exact toBe equality
- Scan-weak-tests: detect vacuous union-narrow `if (X.kind === \"...\") { expect... }` without preceding kind guard
- Handler tests: add explicit r.kind assertion before union-narrowing if-blocks (11 spots in restore/backups/webhook/cron)
- Routes.test: tighten /db/init/marker from toHaveProperty to toEqual({marker:null})
- Storage.test: tighten 'auto-generates timestamp' to full-shape regex (was length+prefix+suffix triplet)
- Categories+sanitize tests: tighten 5 toBeDefined() to format/equality checks
- Routes.test: tighten 5 list-endpoint smoke tests with full toEqual body shape
- Refresh state with final session numbers
- Scan-weak-tests: strip comments + string contents before regex (avoids false positives from English `test`/`it` in comments)
- Refresh ideas backlog
- Storage.test: use fake timers for 'defaults to current time' (replaces \u00b11ms time-window assertion with exact equality)
- Worker setup: add net guard + dns mock (mirrors api safety net)
- Refresh state notes
- Api setup: add loud-failing globalThis.fetch net guard (defensive, prevents accidental real fetch escapes)
- Scan-weak-tests: detect vacuous try/catch (no throw guard before catch with expects)
- Api.test: fix vacuous-pass try/catch in ApiError text/json-parse branches (use rejects.toMatchObject)
- Categories.test: assert exact 21-char nanoid format on createCategory id (was .length>0)
- Routes.test: tighten last 2 webhook auth-precedence OR assertions to 401
- Routes.test: tighten 7 more OR-of-statuses to deterministic 401/404/400
- Routes.test: deterministic db/init + db/seed-test-project (was [200,500] OR)
- Routes.test: deterministic /api/live (200 + dependencies.{d1,r2}.up)
- Routes.test: deterministic stats/totals + stats/charts assertions (was [200,500] OR)
- Routes.test: replace flaky ip-info smoke (real .example DNS) with deterministic 503/400 assertions
- Hoist node:dns mock to setupFiles (fixes isolate:false module-cache race that left real DNS in the cache)
- Routes.test: explicit assertion on cron-success path; weak_tests \u2192 0
- Webhook-logs: assert exact error logged + non-throwing resolution (replace weak toHaveBeenCalled())
- Sweep surface tests + heavy page imports across backups/logs/dashboard/auth; harden TZ-stable assertions
- Trim layout.test.ts surface tests + heavy radix imports
- Vitest 4 migration: maxWorkers:1, isolate:false (top-level)
- Api+worker: pool=threads singleThread, isolate:false; benchmark: add warmup run
- Pool=threads singleThread, isolate:false
- Parallelize workspace test runs (& wait)
- 4 workspaces (web 12/75 + api 26/488 + worker 5/80 + cli 1/5 = 44 files / 648 cases)
- Gitignore wrangler state
- Scaffold UT quality session
- Update CLAUDE.md for local E2E architecture
- Add L2 API E2E to pre-push
- Simplify [env.test] for local-only E2E
- Standardize release workflow to dove template
- Pin accountId + explicit --env="" for wrangler
- Auto-deploy worker to Cloudflare on push-to-main
- Cover RequireAuth reload effect + pagination edge branches
- Migrate to vitest; wire vitest coverage into root G1 (M.4)
- Migrate to vitest + happy-dom (M.3)
- Migrate apps/worker to vitest 4 (M.2)
- Migrate packages/api to vitest 4 (M.1)
- Wire prod (backy) + test (backy-test) workers (E.2)
- Mark Wave E.1 ✅ — root scripts detached from web_legacy (E.1f)
- Sync CLAUDE.md + README.md to new Vite/Worker stack (E.1e)
- Refresh comment block and point osv-config at root (E.1d)
- Pre-push runs only G2 after legacy L2 detach (E.1c)
- Cut over root scripts from web_legacy to apps/web + apps/worker (E.1b)
- Relocate root-level tooling out of web_legacy (E.1a)
- Mark Wave D ✅ complete (D.1–D.12)
- Coverage gate ≥90% for src/lib/** (D.11)
- Wire apps/web into root scripts (D.10)
- Mark Wave D.1–D.3 complete
- Wire apps/worker into root scripts + mark Wave C ✅
- Scaffold Hono + Cloudflare Workers app (Wave C.1)
- Wave B — RuntimeContext DI for portable handlers
- Rename apps/web → apps/web_legacy, scaffold new apps/web + apps/worker
- Include /api/ip path in stubbed ECHO_API_URL
- Make ip-info url assertion env-independent
- Allowlist E2E test fixture token via .gitleaks.toml
- Add base-ci quality workflow (L1+G1+G2)

### Fixed
- Make wrangler.toml version sync fatal in release script
- Isolate BDD backup fixture and strengthen assertions
- Use role-based locators and add port-safety to BDD runner
- Align BDD specs with actual DOM and API contracts
- Align API tests with actual handler contracts
- Replace high-entropy mock webhook token with low-entropy placeholder
- Remove 5 unused eslint-disable-next-line directives in webhook.test.ts
- Adapt E2E runner and tests to backy API format
- Use gitleaks protect --staged in pre-commit context
- Add eslint config for apps/cli
- Add gate:secrets/gate:deps split and update hooks
- Correct logo path in README
- Correct collapsed logo padding to pl-6 per B02-2c
- Migrate shadcn L3 controls from bg-input/border-input to basalt tokens
- Declare tw-animate-css dep; CI install lacks repo-root hoist
- Declare typescript-eslint dep; CI install lacks repo-root hoist
- Inject root pkg version + rotate CF Access AUD
- Align fetch URLs with worker contracts + persist cleared description
- Wire R2 presign config into wrangler.toml
- Preserve legacy backups API contract
- Address Wave B review
- Point release script and root docs at apps/web_legacy
- Preload env stubs for apps/web unit tests on CI
- Declare @types/node devDep explicitly

### Removed
- Remove [env.test] from wrangler.toml
- Remove basic.test.ts (superseded by domain files)
- Ip-info.test: FIX 2 tests (delete env.X to actually trigger ?? '' fallback)
- Routes.test: ADD malformed-JSON test for DELETE /api/logs/webhook (catch-arrow coverage)
- Categories handler tests: tighten 5 update+delete tests (200/400/404) to body shape
- Projects.test: tighten 3 delete+regenerate tests (200/404) to full body shape
- Webhook.test: remove silent contentType default in adapter mock so tests can detect undefined pass-through
- Worker setup: drop unused node:dns mock; keep net guard only
- Routes.test: deterministic cron/trigger/:id 404 + DELETE /api/logs/{webhook,cron}
- Delete ui.test.ts radix-ui surface smoke (was slowest single web test, 159ms)
- Charts.test.ts: remove recharts surface assertions; tighten getChartColor negative test
- Deterministic auth-render loading test + simplify projects.test.ts (drop 7 surface tests)
- Url.test: stub node:dns to remove real DNS calls (stability)
- Delete trivial scaffold.test.ts (302ms surface-only test)
- Remove duplicate health.test.ts (covered by @backy/api)

## [1.8.0] - 2026-04-23

### Changed
- Ignore .next anywhere in tree (was repo-root only)
- Mark Wave 2 + Wave 3 of API extraction plan complete
- Wave 2d.4 — extract webhook handlers
- Wave 2d.3 — extract restore handler
- Wave 2d.2 — extract cron trigger handlers
- Wave 2d.1 — extract webhook + cron log handlers
- Wave 2c — extract backups detail handlers
- Extract handlers — Wave 2b (backups)
- Extract handlers — Wave 2a (projects, categories, db, ip-info, live, stats)
- Extract server libs into @backy/api (Wave 1)
- Add API extraction plan (06)
- Sync CLAUDE.md and README for monorepo layout
- Move web app into apps/web workspace
- Scaffold monorepo workspaces with @backy/api and @backy/cli placeholders
- Upgrade next to 16.2.3 to fix CVE

### Fixed
- Walk up to git root for monorepo layout
- Keep webhook formData parsing inside handler try/catch

### Removed
- Drop transport coupling from restoreCommandHandler
- Remove unused brace-expansion dependency

## [1.7.12] - 2026-04-03

### Added
- Add per-page skeleton to Backups list page (B-4)
- Add per-page skeleton to Projects list page (B-4)
- Add fade-up entry animation with staggered delays
- Add aria-sort attributes to sortable table columns
- Add skeleton component and dashboard loading skeleton

### Changed
- Ignore GHSA-5f7q-jpqc-wp7h false positive
- Replace spinner with per-page skeleton (B-4)
- Migrate ports 7026/17026/27026 → 7017/17017/27017
- Ignore test webhook token in gitleaks
- Update tests for webhook_token sanitization
- Update CLAUDE.md with security fix retrospective entries

### Fixed
- Normalize page container spacing to gap-4 md:gap-6
- Remove card border/shadow anti-pattern, use bg-secondary + radius tokens
- Dashboard framework compliance with basalt B-2 spec
- Login page layout, footer, and aria-hidden per basalt spec
- Update brace-expansion and ignore transitive vuln
- Remove production instance information from tracked files
- Fix false dirty state for configured headers
- Fix dirty state and header clearing issues
- Prevent accidental secret overwrite & token display issues
- Resolve 9 dev toolchain vulnerabilities via version overrides
- Add streaming size limits to prevent decompression bomb DoS
- Strip sensitive credentials from project API responses
- Block additional reserved IPv4 CIDRs and IPv6 ranges in SSRF protection
- Validate x-forwarded-host against allowlist in prompt route
- Add --max-warnings=0 to lint script in package.json

### Removed
- Remove unused shadcn and @radix-ui/react-collapsible deps

## [1.7.11] - 2026-04-03

### Added
- Add per-page skeleton to Backups list page (B-4)
- Add per-page skeleton to Projects list page (B-4)
- Add fade-up entry animation with staggered delays
- Add aria-sort attributes to sortable table columns
- Add skeleton component and dashboard loading skeleton

### Changed
- Ignore GHSA-5f7q-jpqc-wp7h false positive
- Replace spinner with per-page skeleton (B-4)
- Migrate ports 7026/17026/27026 → 7017/17017/27017
- Ignore test webhook token in gitleaks
- Update tests for webhook_token sanitization
- Update CLAUDE.md with security fix retrospective entries

### Fixed
- Normalize page container spacing to gap-4 md:gap-6
- Remove card border/shadow anti-pattern, use bg-secondary + radius tokens
- Dashboard framework compliance with basalt B-2 spec
- Login page layout, footer, and aria-hidden per basalt spec
- Update brace-expansion and ignore transitive vuln
- Remove production instance information from tracked files
- Fix false dirty state for configured headers
- Fix dirty state and header clearing issues
- Prevent accidental secret overwrite & token display issues
- Resolve 9 dev toolchain vulnerabilities via version overrides
- Add streaming size limits to prevent decompression bomb DoS
- Strip sensitive credentials from project API responses
- Block additional reserved IPv4 CIDRs and IPv6 ranges in SSRF protection
- Validate x-forwarded-host against allowlist in prompt route
- Add --max-warnings=0 to lint script in package.json

### Removed
- Remove unused shadcn and @radix-ui/react-collapsible deps

## [1.7.10] - 2026-04-03

### Added
- Add per-page skeleton to Backups list page (B-4)
- Add per-page skeleton to Projects list page (B-4)
- Add fade-up entry animation with staggered delays
- Add aria-sort attributes to sortable table columns
- Add skeleton component and dashboard loading skeleton

### Changed
- Replace spinner with per-page skeleton (B-4)
- Migrate ports 7026/17026/27026 → 7017/17017/27017
- Ignore test webhook token in gitleaks
- Update tests for webhook_token sanitization
- Update CLAUDE.md with security fix retrospective entries

### Fixed
- Normalize page container spacing to gap-4 md:gap-6
- Remove card border/shadow anti-pattern, use bg-secondary + radius tokens
- Dashboard framework compliance with basalt B-2 spec
- Login page layout, footer, and aria-hidden per basalt spec
- Update brace-expansion and ignore transitive vuln
- Remove production instance information from tracked files
- Fix false dirty state for configured headers
- Fix dirty state and header clearing issues
- Prevent accidental secret overwrite & token display issues
- Resolve 9 dev toolchain vulnerabilities via version overrides
- Add streaming size limits to prevent decompression bomb DoS
- Strip sensitive credentials from project API responses
- Block additional reserved IPv4 CIDRs and IPv6 ranges in SSRF protection
- Validate x-forwarded-host against allowlist in prompt route
- Add --max-warnings=0 to lint script in package.json

### Removed
- Remove unused shadcn and @radix-ui/react-collapsible deps

## [1.7.6] - 2026-03-24

### Added
- Add automated release script

## [1.7.5] - 2026-03-24

### Added

- **TypeScript ESLint strict rules** — Enabled `tseslint.configs.strict` in ESLint config for stronger type-aware linting

### Changed

- **Removed non-null assertions project-wide** — Replaced `!` assertions with proper null checks across route handlers, page components, backup libs, IP/URL utilities, and scripts (6 commits, 12 files)

### Fixed

- **Gitleaks incremental scanning** — Optimized from full-repo scan to incremental (`--log-opts` with commit range), significantly faster pre-push gate

## [1.7.4] - 2026-03-22

### Added

- **E2E test resource isolation** — Dedicated Cloudflare D1 (`backy-db-test`) and R2 (`backy-test`) for E2E tests, production data is never touched
- **Three-layer `.env.test` safety** — `scripts/load-env-test.ts` validates: file exists → required keys present → values differ from production. Falls back to `process.env` and hard-fails if isolation cannot be verified
- **Test project seed endpoint** — `POST /api/db/seed-test-project` auto-creates/resets the `backy-test` project with baseline state, gated by `E2E_SKIP_AUTH`
- **Single source of truth for test constants** — `src/lib/test-project.ts` exports ID, name, token for E2E project

### Changed

- **E2E runners rewired** — Both L2 (`scripts/run-e2e.ts`) and L3 (`e2e/bdd/runner.ts`) now use `loadTestEnv()` instead of raw `process.env`, with schema init response checking and seed before test execution
- **L3 Playwright specs** — Adapted backup list/detail specs to work with empty test DB (no pre-existing data assumption)
- **DNS test timeouts** — Increased from 5s to 15s for tests performing real DNS lookups

### Fixed

- **Layer 3 safety fail-closed** — Previously silently skipped isolation check when `.env` was absent; now falls back to `process.env` and hard-fails if neither source has a production value
- **Schema init response check** — E2E runners now abort on `POST /api/db/init` failure instead of silently continuing

### Documentation

- **CLAUDE.md** — Added "Test Resource Isolation" section, updated project structure and retrospective
- **README.md** — Updated E2E section to describe dedicated test resources

## [1.7.3] - 2026-03-22

### Added

- **Quality system upgrade (L1+L2+L3+G1+G2)** — Replaced legacy 4-tier testing with 3 test layers + 2 quality gates: G1 static analysis (tsc + ESLint) and G2 security scanning (osv-scanner + gitleaks) now run automatically via Git hooks
- **G1 typecheck gate** — `tsc --noEmit` runs on every commit, catching type errors before tests
- **G1 lint-staged** — ESLint runs only on staged files with `--max-warnings 0`, zero tolerance for warnings
- **G2 security gate** — `osv-scanner` (dependency vulnerabilities) and `gitleaks` (secret leak detection) run in parallel on every push, hard fail if tools missing or findings detected
- **osv-scanner.toml** — Explicit ignore list for 11 indirect dependency vulnerabilities (MCP SDK, eslint transitive deps) with 90-day review deadline

### Changed

- **Pre-commit hook** — Rewritten to sequential G1→L1: typecheck → lint-staged → test:coverage
- **Pre-push hook** — Rewritten to parallel L2‖G2: API E2E and security gate run concurrently

### Fixed

- **Railway reverse proxy** — Restored `trustHost` for Railway deployment and updated domain to `your-domain.example.com`
- **Docker build** — Excluded `scripts/` and `e2e/` from tsconfig to fix production build

### Security

- **Next.js 16.1.6 → 16.1.7** — Fixes 5 known vulnerabilities (GHSA-3x4c, GHSA-ggv3, GHSA-h27x, GHSA-jcc7, GHSA-mq59)
- **Dependency patch** — Updated aws-sdk, nanoid, recharts, tailwindcss, eslint, and type packages

### Documentation

- **Quality system upgrade plan** — `docs/04-quality-system-upgrade.md` with gap analysis, atomic commit plan, and verification checklist
- **CLAUDE.md** — Replaced "Four-Tier Testing" with "Quality System (3 Test Layers + 2 Gates)" including hooks mapping
- **README.md** — Updated command table (accurate test counts) and replaced "测试体系" with "质量体系" section

## [1.7.2] - 2026-03-15

### Security

- **SSRF protection for webhooks** — New `src/lib/url.ts` module with two-layer defense: `isUrlSafe()` (synchronous, save-time) blocks private IPs, internal hostnames, non-HTTPS; `resolveAndValidateUrl()` (async, fetch-time) performs DNS resolution to block rebinding attacks
- **IPv6 SSRF coverage** — Added `isPrivateIpv6()` with full coverage for loopback (`::1`), link-local (`fe80::/10`), ULA (`fc00::/7`), IPv4-mapped (`::ffff:x.x.x.x`), and unspecified (`::`) addresses. DNS validation queries both A and AAAA records
- **SSRF allowlist hardening** — Changed `SSRF_ALLOWLIST` from string prefix matching to parsed origin (protocol+hostname+port) comparison, preventing bypass via crafted hostnames like `api.example.com.evil.tld`
- **Removed query parameter token** — Restore endpoint (`/api/restore/[id]`) no longer accepts `?token=X`; requires `Authorization: Bearer` header only. Prevents token leakage to browser history, access logs, and Referer headers
- **Open redirect prevention** — `x-forwarded-host` header validated against `ALLOWED_HOSTS` allowlist before use in redirect URLs; untrusted values fall back to request origin
- **OAuth callback hardening** — Removed `trustHost: true` from NextAuth config to prevent callback URL hijacking via Host header spoofing. Uses explicit `NEXTAUTH_URL` env var instead
- **Restricted /api/db/init** — Removed from public route whitelist; now requires authentication like all other API routes

### Documentation

- **Design document** — Rewrote `docs/01-design.md` to match code reality, corrected inaccuracies
- **Environment config** — Updated `.env.example` with `NEXTAUTH_URL` (marked required), `ALLOWED_HOSTS`, and `SSRF_ALLOWLIST` documentation

## [1.7.1] - 2026-03-11

### Fixed

- **Webhook log default visibility** — Show all webhook logs by default instead of requiring explicit filter selection

### Refactored

- **Logo pipeline** — Adopted single-source logo with Next.js file convention, eliminating manual icon duplication
- **Dead code cleanup** — Removed 7 unused exports with zero production callers: `getBackupFileKeys`, `deleteMultipleFromR2`, `listR2Objects`, `resetR2Client`, `getFileTypeLabel`, `getWebhookLog`, `purgeWebhookLogs` (-233 lines)

## [1.7.0] - 2026-03-07

### Fixed

- **Mobile navigation accessibility** — Added dialog semantics, focus trapping, Escape close handling, and an explicit close control for the mobile sidebar drawer
- **Icon-only action labeling** — Added accessible names across backup, project, restore, upload, category, and search clear actions
- **Responsive list layouts** — Reworked backup and cron log list rows for mobile card-style layouts instead of desktop-first fixed-width columns
- **Dashboard recent backup fetch** — Limited homepage recent backup loading to `pageSize=5` instead of fetching a larger default payload and truncating client-side
- **Loading overlay anchoring** — Wrapped list page content in explicit relative containers so follow-up loading overlays stay scoped correctly

### Changed

- **Semantic color tokens** — Added `info`, `warning`, and `surface-elevated` tokens and replaced remaining hardcoded UI colors in login, loading, JSON viewer, upload, and cron status surfaces
- **Chart accessibility summaries** — Added text summaries beneath dashboard charts so key counts remain readable without relying only on color and hover tooltips

### Refactored

- **Project detail composition** — Split webhook/prompt and recent backup sections out of `projects/[id]` into dedicated feature components to reduce page-level responsibility

### Documentation

- **Audit remediation tracking** — Updated `docs/03-impeccable-audit-report.md` with per-issue fix status and implementation notes

## [1.6.0] - 2026-03-06

### Changed

- **Pre-push hook** — Removed BDD E2E (L4) from pre-push hook, making it on-demand only for faster push cycles
- **Dependencies** — Upgraded `@types/node` 20 → 25, plus patch/minor bumps for aws-sdk, lucide, react, shadcn, tailwind-merge, and types/bun
- **Removed redundant `@types/jszip`** — jszip ships built-in types, eliminating the duplicate declaration

### Documentation

- **CLAUDE.md** — Added project structure section with all source directories, tech stack additions (Recharts, Zod v4), test:coverage command, and clarified E2E counts (148 defined, 146 run, 2 conditional)

## [1.5.0] - 2026-03-03

### Features

- **Playwright BDD E2E (L4)** — New fourth testing tier with 5 Playwright specs covering dashboard, projects, backup detail, manual upload, and navigation/restore flows (17 tests, Chromium headless)
- **Shared Test Helpers** — New `src/__tests__/helpers.ts` module with `mockFetch`, `d1Success`/`d1Error` builders, and reusable stubs (`PROJECT_STUB`, `BACKUP_STUB`, `R2_STUBS`) eliminating ~300 lines of duplication

### Changed

- **4-Tier Testing Architecture** — Upgraded from 3-tier to 4-tier: L1 Unit Tests (pre-commit), L2 Lint (pre-commit), L3 API E2E (pre-push, port 17017), L4 BDD E2E (pre-push, port 27017)
- **E2E Modularization** — Split 2012-line monolithic E2E file into `e2e/api/` with 21 individual suite files, shared framework, config, and helpers
- **Unit test count** — 335 → 421 unit tests across 34 files (12 new route handler test files)
- **Test coverage** — 93.9% functions, 96.39% lines
- **Pre-push hook** — Now runs all 4 tiers: `test && lint && test:e2e:api && test:e2e:bdd`

### Infrastructure

- **New directory**: `e2e/api/` — Modular L3 API E2E structure (config, framework, helpers, runner, 21 suites)
- **New directory**: `e2e/bdd/` — L4 Playwright BDD E2E (config, runner, 5 spec files)
- **New dependency**: `@playwright/test` + Chromium for browser-level E2E testing
- **New scripts**: `test:e2e:bdd` for L4 BDD E2E runner (port 27017)

## [1.4.0] - 2026-03-02

### Features

- **File Type Detection** — New `file-type` module with `detectFileType()`, `isPreviewable()`, and `isExtractable()` functions for robust content-based file identification
- **GZ/TGZ Extraction** — Extract and preview JSON content from `.gz` and `.tar.gz` archives alongside existing ZIP support
- **Storage Key Generation** — Dedicated `storage` module for consistent backup and preview key generation
- **Schema Migration** — New `file_type` column on `backups` table with automatic migration for existing records

### Changed

- **Webhook Route** — Refactored to use new `file-type` module for content detection instead of inline logic
- **Upload Route** — Refactored to use new `file-type` module; now accepts all file formats (not just JSON/ZIP)
- **Extract Route** — Refactored to use new `extractors` module with strategy pattern for ZIP/GZ/TGZ extraction
- **Backup Detail UI** — Updated to show file type badge and handle non-previewable files with "no preview available" message
- **Backup List UI** — File type badges displayed in backup list and project detail pages
- **Manual Upload Dialog** — Accepts all file formats instead of restricting to `.json` and `.zip`
- **Unit test count** — 247 → 335 unit tests across 22 files
- **E2E test suites** — Added GZ, TGZ, and unknown file type E2E suites (134 → 146 tests)

### Fixed

- **E2E port conflict** — Kill orphan processes on E2E port before starting server
- **Cron log deletion verification** — Retry D1 deletion verification for eventual consistency
- **E2E assertions** — Corrected assertions for gz `source_file` field and unknown type error messages

### Infrastructure

- **New modules**: `src/lib/backup/file-type.ts`, `src/lib/backup/storage.ts`, `src/lib/backup/extractors.ts`
- **Pre-commit coverage gate** — Enforced 90% coverage threshold in husky pre-commit hook

## [1.3.0] - 2026-03-02

### Features

- **Scheduled Auto-Backup** — Per-project auto-backup with configurable interval (1 / 12 / 24 hours), external webhook URL, and optional auth header. Backy POSTs to the target's endpoint on schedule; the target then pushes a backup back
- **Cron Worker** — Cloudflare Worker cron job calls `POST /api/cron/trigger` hourly, iterating auto-backup projects with interval-based scheduling (`shouldTrigger` UTC hour modulo)
- **Cron Logs** — Full audit trail for every cron cycle: `triggered`, `skipped`, `success`, or `failed` with response code, duration, and error text. Dedicated Cron Logs page with project/status filtering, expandable row details, pagination, and bulk delete
- **Manual Trigger** — "Test Now" button on the Auto Backup card fires `POST /api/cron/trigger/[projectId]` to manually test a single project's webhook. The result is recorded in cron logs identically to scheduled triggers
- **Cron Activity Chart** — New stacked bar chart on the Dashboard showing daily success/failed/skipped breakdown for the last 30 days
- **Collapsible Sidebar Groups** — Sidebar navigation reorganized into collapsible "Overview" and "Monitoring" groups with CSS grid animation (Radix Collapsible)
- **AI Agent Prompt v2** — Comprehensive prompt covering Push (you → Backy) and Pull (Backy → you) modes with credentials table, all endpoint docs (HEAD/GET/POST/restore), status code tables, field descriptions, curl examples, and Node.js/fetch code samples. Conditional on auto-backup config

### Changed

- **Project Settings Layout** — Reorganized with Card components in a two-column grid: General + Auto Backup (left), Webhook + AI Prompt (right), Recent Backups + Danger Zone (full-width below)
- **Full-Width Pages** — Removed `max-w-2xl` from project settings and `max-w-lg` from new project page
- **Tooltip Positioning** — Fixed recharts tooltip animation that caused tooltips to fly from (0,0) to the cursor position. Disabled tooltip entry animation (`isAnimationActive={false}`) across all charts
- **Unit test count** — 215 → 247 unit tests across 18 files (743 expect() calls)
- **E2E test suites** — Added cron auto-backup E2E suite with 12 tests

### Infrastructure

- **New DB table**: `cron_logs` with indexes on `project_id`, `triggered_at`, `status`
- **New columns on `projects`**: `auto_backup_enabled`, `auto_backup_interval`, `auto_backup_webhook`, `auto_backup_header_key`, `auto_backup_header_value`
- **New dependency**: `@radix-ui/react-collapsible` for sidebar group animation

## [1.2.0] - 2026-02-24

### Features

- **Project Categories** — Organize projects into categories with custom name, color (10 presets), and icon (20 Lucide icons). Full CRUD via REST API (`/api/categories`) with Zod validation
- **Category Grouping** — Projects page groups projects by category with colored section headers, themed card borders, and icon badges
- **Category Selector** — Assign categories to projects from the project detail page via dropdown selector
- **Category Management Dialog** — Create, edit, and delete categories with color picker and icon selector from the projects page
- **Manual Backup Upload** — Upload JSON or ZIP backup files directly from the UI via drag-and-drop dialog. JSON files are auto-compressed to ZIP with a preview copy stored for instant viewing
- **Webhook Audit Logging** — Full audit trail for all webhook requests with method, status, IP, duration, and metadata. Dashboard UI with filtering by project, method, status, and pagination
- **Log Management** — Project filter, compact date display, duration column header, and bulk log clearing from the logs page
- **Log Filtering** — Exclude localhost (`::1`) traffic and `backy-test` project from logs by default
- **IP Geolocation in Logs** — Show country, region, city, and ISP info in log detail view

### Fixed

- **Schema migration ordering** — Indexes referencing columns added by `ALTER TABLE` migrations now execute after the migration, fixing `SQLITE_ERROR: no such column` on existing databases
- **D1 transient timeout retry** — Added exponential backoff retry (3 attempts) to `executeD1Query` for D1 timeout errors (code 7429)

### Changed

- **Unit test count** — 126 → 215 unit tests across 15 files (640 expect() calls)
- **E2E test suites** — Added category CRUD lifecycle and manual upload round-trip E2E suites

## [1.1.1] - 2026-02-23

### Features

- **Liveness probe** — Upgraded `GET /api/live` to a full health check endpoint with D1 and R2 connectivity verification, per-dependency latency reporting, timeout protection, and no-cache headers
- **IP geolocation** — Integrated IP geolocation lookup in backup detail sender card, showing country, region, city, and ISP info
- **IP restriction** — Enforced CIDR-based IP restriction on all webhook and restore endpoints with fail-closed policy
- **CIDR matching** — Added `isIpAllowed` helper with support for IPv4/IPv6 CIDR notation and `getClientIp` with Envoy/XFF header parsing

### Fixed

- **IP enforcement hardening** — Use rightmost XFF entry, prefer Envoy `x-envoy-external-address` header, fail-closed on parse errors, generic error messages to prevent information leakage

### Changed

- **Webhook docs** — Updated README and AI prompt with full webhook protocol documentation
- **Version source** — Unified version reporting in `/api/live` to use `NEXT_PUBLIC_APP_VERSION` (from `package.json` via `next.config.ts`) instead of `npm_package_version`
- **Unit test count** — 71 → 126 unit tests

## [1.1.0] - 2026-02-23

### Features

- **Dashboard Charts** — Per-project backup count and storage charts, daily backup activity chart powered by Recharts
- **Webhook GET Endpoint** — Query backup status via `GET /api/webhook/{projectId}` returning total count and 5 most recent backups
- **Version Badge** — Display app version in sidebar, read from package.json at build time

### Fixed

- **Backup table wipe on action error** — Action errors (delete, restore) no longer replace the entire backup list; errors now display as toast notifications
- **Dashboard recent backups not showing** — Fixed incorrect response shape destructuring (`data` vs `data.items`)
- **DB init route blocked by auth** — Made `/api/db/init` public so schema migrations can run without OAuth

### Changed

- **Toast notification system** — Migrated inline error banners to sonner toast notifications across project detail, backup detail, and backup list pages
- **Unit test count** — 61 → 71 unit tests

## [1.0.0] - 2026-02-23

Initial release — all 6 implementation phases complete.

### Features

- **Project Management** — Create and manage backup projects with independent webhook tokens
- **Webhook Receiving** — Receive backup files (ZIP / JSON) via `POST /api/webhook/{projectId}` with Bearer token auth
- **API Key Verification** — Lightweight `HEAD` request on webhook endpoint to validate API key before uploading
- **Backup Management UI** — Global and per-project backup lists with search, filter, sort, pagination, and batch delete
- **JSON Preview** — In-browser tree viewer for JSON backup content
- **JSON Extraction** — Extract JSON from ZIP archives for preview
- **Restore** — Generate temporary signed download URLs for AI agents via `/api/restore/{backupId}`
- **AI Agent Prompt** — One-click generation of integration instructions with real credentials and curl examples
- **Dashboard** — Live stats overview (projects, backups, storage usage)
- **Allowed IP Ranges** — Optional CIDR-based IP restriction per project
- **Google OAuth** — Authentication with email whitelist for access control
- **App Shell** — Collapsible sidebar, breadcrumbs, real user avatar and email display

### Infrastructure

- **Cloudflare D1** metadata database via REST API
- **Cloudflare R2** file storage via S3-compatible API
- **Railway + Docker** deployment with auto-deploy on push to main
- **Three-tier testing** — 61 unit tests + ESLint + 34 E2E tests
- **Husky git hooks** — pre-commit (UT + lint), pre-push (UT + lint + E2E)
- **90%+ test coverage** enforced by coverage gate script

[1.7.3]: https://github.com/nocoo/backy/compare/v1.7.2...v1.7.3
[1.7.2]: https://github.com/nocoo/backy/compare/v1.7.1...v1.7.2
[1.7.1]: https://github.com/nocoo/backy/compare/v1.7.0...v1.7.1
[1.7.0]: https://github.com/nocoo/backy/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/nocoo/backy/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/nocoo/backy/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/nocoo/backy/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/nocoo/backy/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/nocoo/backy/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/nocoo/backy/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/nocoo/backy/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/nocoo/backy/releases/tag/v1.0.0
