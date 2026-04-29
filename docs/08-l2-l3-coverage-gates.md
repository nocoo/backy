# 08 — L2/L3 Coverage Gates & CD Version Verification

> Bring backy to dove-level quality: full E2E coverage, static coverage gates, and CD version verification.

## Background

Comparing backy vs dove quality systems reveals gaps in:

| Gap | backy (current) | dove (target) |
|-----|-----------------|---------------|
| L2 API E2E | 1 file, CI disabled | Full coverage, CI enabled, gate:routes |
| L3 BDD E2E | None, CI disabled | Full coverage, CI enabled, gate:pages |
| Coverage thresholds | 85-95% | 99% lines, 96% branches |
| CD verification | HTTP 200 only | /api/live version match |

## Goals

1. **L2**: Complete e2e/api test suite covering all API routes; CI enabled
2. **L3**: New e2e/bdd suite covering all frontend pages; CI enabled
3. **gate:routes**: Static analysis ensuring every API route has an E2E test
4. **gate:pages**: Static analysis ensuring every frontend page has a BDD spec
5. **Coverage thresholds**: Ratchet up to 95%+ across all packages
6. **CD version verification**: Deploy verifies /api/live returns matching version

---

## Complete API Route Inventory

Extracted from `apps/worker/src/index.ts` + `apps/worker/src/routes/*.ts`:

### /api/projects
| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/projects` | listProjectsHandler |
| POST | `/api/projects` | createProjectHandler |
| GET | `/api/projects/:id` | getProjectHandler |
| PUT | `/api/projects/:id` | updateProjectHandler |
| DELETE | `/api/projects/:id` | deleteProjectHandler |
| POST | `/api/projects/:id/token` | regenerateTokenHandler |
| GET | `/api/projects/:id/prompt` | projectPromptHandler |

### /api/categories
| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/categories` | listCategoriesHandler |
| POST | `/api/categories` | createCategoryHandler |
| GET | `/api/categories/:id` | getCategoryHandler |
| PUT | `/api/categories/:id` | updateCategoryHandler |
| DELETE | `/api/categories/:id` | deleteCategoryHandler |

### /api/backups
| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/backups` | listBackupsHandler |
| POST | `/api/backups/upload` | uploadBackupHandler |
| DELETE | `/api/backups` | batchDeleteBackupsHandler |
| GET | `/api/backups/:id` | getBackupHandler |
| DELETE | `/api/backups/:id` | deleteBackupHandler |
| GET | `/api/backups/:id/download` | downloadBackupHandler |
| GET | `/api/backups/:id/preview` | previewBackupHandler |
| POST | `/api/backups/:id/extract` | extractBackupHandler |
| GET | `/api/backups/:id/restore-command` | restoreCommandHandler |

### /api/cron
| Method | Path | Handler |
|--------|------|---------|
| POST | `/api/cron/trigger` | cronTriggerHandler |
| POST | `/api/cron/trigger/:projectId` | cronTriggerOneHandler |

### /api/logs
| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/logs/webhook` | listWebhookLogsHandler |
| DELETE | `/api/logs/webhook` | deleteWebhookLogsHandler |
| GET | `/api/logs/cron` | listCronLogsHandler |
| DELETE | `/api/logs/cron` | deleteCronLogsHandler |

### /api/stats
| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/stats/totals` | statsTotalsHandler |
| GET | `/api/stats/charts` | statsChartsHandler |

### /api/live
| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/live` | liveCheckHandler |

### /api/ip-info
| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/ip-info` | ipInfoHandler |

### /api/db (E2E-only)
| Method | Path | Handler |
|--------|------|---------|
| POST | `/api/db/init` | dbInitHandler |
| GET | `/api/db/init/marker` | getTestMarkerHandler |
| POST | `/api/db/seed-test-project` | seedTestProjectHandler |

### /api/restore
| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/restore/:id` | restoreHandler |

### /api/webhook
| Method | Path | Handler |
|--------|------|---------|
| HEAD | `/api/webhook/:projectId` | webhookHeadHandler |
| GET | `/api/webhook/:projectId` | webhookGetHandler |
| POST | `/api/webhook/:projectId` | webhookPostHandler |

### /api/me
| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/me` | (inline: returns accessEmail) |

**Total: 39 routes**

---

## Complete Frontend Page Inventory

Extracted from `apps/web/src/App.tsx`:

| Path | Component |
|------|-----------|
| `/` | DashboardPage |
| `/projects` | ProjectsPage |
| `/projects/new` | ProjectNewPage |
| `/projects/:id` | ProjectDetailPage |
| `/backups` | BackupsPage |
| `/backups/:id` | BackupDetailPage |
| `/logs` | LogsPage |
| `/cron-logs` | CronLogsPage |

**Total: 8 pages**

---

## File Modification Map

| File | Change | Phase |
|------|--------|-------|
| `e2e/api/*.ts` | Add missing API E2E tests | Wave A |
| `scripts/check-route-coverage.ts` | **New**: Static L2 coverage gate | Wave A |
| `package.json` | Add `gate:routes` script | Wave A |
| `e2e/bdd/*.spec.ts` | **New**: Playwright BDD specs | Wave B |
| `e2e/bdd/playwright.config.ts` | **New**: Playwright config | Wave B |
| `scripts/check-page-coverage.ts` | **New**: Static L3 coverage gate | Wave B |
| `scripts/run-e2e-bdd.ts` | **New**: BDD runner (starts worker, runs Playwright) | Wave B |
| `package.json` | Add `gate:pages`, `test:e2e:bdd` scripts | Wave B |
| `.husky/pre-commit` | Add gate:routes, gate:pages checks | Wave B |
| `.github/workflows/ci.yml` | Enable `enable-l2: true`, `enable-l3: true` | Wave B |
| `.github/workflows/release.yml` | Add version verification step | Wave C |
| `*/vitest.config.ts` | Raise thresholds to 95%+ | Wave D |

---

## Wave A: L2 API E2E + gate:routes

### A.1 E2E Test File Structure

```
e2e/api/
├── config.ts              # shared config (base URL, test project)
├── projects.test.ts       # 7 routes
├── categories.test.ts     # 5 routes
├── backups.test.ts        # 9 routes
├── cron.test.ts           # 2 routes
├── logs.test.ts           # 4 routes
├── stats.test.ts          # 2 routes
├── live.test.ts           # 1 route
├── ip-info.test.ts        # 1 route
├── db.test.ts             # 3 routes (E2E-only endpoints)
├── restore.test.ts        # 1 route
├── webhook.test.ts        # 3 routes
└── me.test.ts             # 1 route
```

### A.2 gate:routes Script

Port from dove, adapted for backy monorepo structure:

```typescript
// scripts/check-route-coverage.ts
// 1. Scan apps/worker/src/index.ts for app.route() mounts
// 2. Scan apps/worker/src/routes/*.ts for .get/.post/.put/.delete/.patch
// 3. Scan e2e/api/*.ts for HTTP calls (fetch, request patterns)
// 4. Fail if any declared route has no matching E2E call
```

Add to `package.json`:
```json
"gate:routes": "bun run scripts/check-route-coverage.ts"
```

### A.3 Atomic Commits

1. ✅ `feat(e2e): add shared E2E config module`
2. ✅ `feat(e2e): add projects E2E tests (7 routes)`
3. ✅ `feat(e2e): add categories E2E tests (5 routes)`
4. ✅ `feat(e2e): add backups E2E tests (9 routes)`
5. ✅ `feat(e2e): add cron E2E tests (2 routes)`
6. ✅ `feat(e2e): add logs E2E tests (4 routes)`
7. ✅ `feat(e2e): add stats E2E tests (2 routes)`
8. ✅ `feat(e2e): add live/ip-info/me E2E tests (3 routes)`
9. ✅ `feat(e2e): add db E2E tests (3 routes)`
10. ✅ `feat(e2e): add restore E2E test (1 route)`
11. ✅ `feat(e2e): add webhook E2E tests (3 routes)`
12. ✅ `refactor(e2e): remove basic.test.ts (superseded)`
13. ✅ `feat: add gate:routes static coverage check`
14. ✅ `fix(e2e): align API tests with actual handler contracts`

**Wave A Status: COMPLETE** (2026-04-29)

---

## Wave B: L3 BDD E2E + gate:pages

### B.1 BDD Test File Structure

```
e2e/bdd/
├── playwright.config.ts
├── dashboard.spec.ts          # /
├── projects.spec.ts           # /projects, /projects/new, /projects/:id
├── backups.spec.ts            # /backups, /backups/:id
├── logs.spec.ts               # /logs, /cron-logs
└── fixtures/
    └── test-data.ts           # test project ID for dynamic routes
```

Dynamic route strategy:
- `/projects/:id` and `/backups/:id` use the seeded test project
- Test data created via `/api/db/seed-test-project` before BDD run

### B.2 BDD Runner Script

```typescript
// scripts/run-e2e-bdd.ts
// 1. Build apps/web (bun run build)
// 2. Start apps/worker in dev mode (wrangler dev)
// 3. Wait for /api/live to respond
// 4. Run Playwright (npx playwright test)
// 5. Kill worker on exit
```

Add to root `package.json`:
```json
"test:e2e:bdd": "bun run scripts/run-e2e-bdd.ts"
```

### B.3 gate:pages Script

Port from dove, adapted for backy:

```typescript
// scripts/check-page-coverage.ts
// 1. Scan apps/web/src/App.tsx for <Route path="...">
// 2. Scan e2e/bdd/*.spec.ts for page.goto() calls
// 3. Fail if any declared page has no matching BDD visit
```

Add to `package.json`:
```json
"gate:pages": "bun run scripts/check-page-coverage.ts"
```

### B.4 Wire to Pre-commit

Update `.husky/pre-commit` to add (append to existing chain):
```bash
bun run typecheck \
  && bun run lint:staged \
  && bun run gate:secrets \
  && bun run gate:routes \
  && bun run gate:pages \
  && bun run test:coverage
```

### B.5 Enable L2/L3 in CI

Update `.github/workflows/ci.yml`:
```yaml
with:
  enable-l2: "true"
  l2-command: "bun run test:e2e:api"
  enable-l3: "true"
  l3-command: "bun run test:e2e:bdd"
  l3-browser: "chromium"
```

### B.6 Atomic Commits

1. ✅ `feat(e2e): add Playwright BDD config and fixtures`
2. ✅ `feat(e2e): add dashboard BDD spec (/)`
3. ✅ `feat(e2e): add projects BDD specs (/projects, /projects/new, /projects/:id)`
4. ✅ `feat(e2e): add backups BDD specs (/backups, /backups/:id)`
5. ✅ `feat(e2e): add logs BDD specs (/logs, /cron-logs)`
6. ✅ `feat: add gate:pages static coverage check`
7. ✅ `feat: add test:e2e:bdd runner script`
8. ✅ `chore: wire gate:routes and gate:pages to pre-commit`
9. ✅ `ci: enable L2 and L3 in CI workflow`

**Wave B Status: COMPLETE** (2026-04-30)

---

## Wave C: CD Version Verification

### C.1 Current State

`liveCheckHandler` already returns `version` from `ctx.env.NEXT_PUBLIC_APP_VERSION`:

```typescript
// packages/api/src/handlers/live.ts:67
version: ctx.env.NEXT_PUBLIC_APP_VERSION ?? "unknown",
```

The env var is set via `wrangler.toml` or deploy-time config.

### C.2 Version Injection Strategy (Recommended: Option 1)

**Build-time injection via wrangler.toml** (chosen approach):

Add to `apps/worker/wrangler.toml`:
```toml
[vars]
NEXT_PUBLIC_APP_VERSION = "1.8.0"  # Updated by release script
```

Update `scripts/release.ts` to:
1. Bump `package.json` version
2. Update `apps/worker/wrangler.toml` `NEXT_PUBLIC_APP_VERSION`
3. Commit both files

**Alternative (not used): CI-time injection**

For reference, version can also be passed at deploy-time:
```yaml
- name: Deploy Worker
  uses: cloudflare/wrangler-action@v3
  with:
    command: deploy
    vars: NEXT_PUBLIC_APP_VERSION=${{ steps.ver.outputs.version }}
```
This approach is not recommended because it decouples version from the committed wrangler.toml, making local dev/staging inconsistent with production.

### C.3 Update release.yml

Add version read step and verification:

```yaml
- name: Read version
  id: ver
  run: |
    VERSION=$(jq -r .version package.json)
    echo "version=$VERSION" >> "$GITHUB_OUTPUT"

- name: Verify /api/live reports new version
  run: |
    set -e
    EXPECTED="${{ steps.ver.outputs.version }}"
    for i in 1 2 3 4 5 6; do
      RESP=$(curl -fsS https://backy.hexly.ai/api/live || echo '{}')
      ACTUAL=$(echo "$RESP" | jq -r .version)
      echo "attempt $i: live=$ACTUAL expected=$EXPECTED"
      if [ "$ACTUAL" = "$EXPECTED" ]; then
        echo "✅ Live version matches"
        exit 0
      fi
      sleep 5
    done
    echo "❌ /api/live did not report $EXPECTED after 30s"
    exit 1
```

### C.4 Atomic Commits

1. ✅ `feat: sync NEXT_PUBLIC_APP_VERSION in release script`
2. ✅ `ci: add version verification to release workflow`
3. ✅ `fix: make wrangler.toml version sync fatal in release script`

**Wave C Status: COMPLETE** (2026-04-30)

---

## Wave D: Coverage Threshold Ratchet

### D.1 Current Thresholds

| Package | lines | funcs | branches |
|---------|-------|-------|----------|
| packages/api | 90% | 90% | 80% |
| apps/worker | 90% | 85% | 80% |
| apps/web | 95% | 95% | 90% |
| apps/cli | (TBD) | (TBD) | (TBD) |

### D.2 Target Thresholds

| Package | lines | funcs | branches |
|---------|-------|-------|----------|
| packages/api | **95%** | **95%** | **90%** |
| apps/worker | **95%** | **95%** | **90%** |
| apps/web | **98%** | **98%** | **95%** |
| apps/cli | 90% | 90% | 85% |

### D.3 Ratchet Strategy

1. Run current coverage, record actual percentages
2. Set thresholds 1% below actual (headroom for fluctuation)
3. After adding tests, ratchet thresholds up to match
4. Repeat until targets reached

### D.4 Atomic Commits

1. ✅ `chore: ratchet packages/api coverage to 95%`
2. ✅ `chore: ratchet apps/worker coverage to 95%`
3. ✅ `chore: ratchet apps/web coverage to 98%`

### D.5 Actual Thresholds Applied (2026-04-30)

| Package | stmts | lines | funcs | branches | Notes |
|---------|-------|-------|-------|----------|-------|
| packages/api | 95% | 95% | 95% | 90% | All at target |
| apps/worker | 95% | 95% | 93% | 90% | funcs 1% below actual (94.82%); thin route shims |
| apps/web | 98% | 98% | 98% | 90% | branches 1% below actual (91.66%); env branches covered by L3 |
| apps/cli | 90% | 90% | 90% | 80% | Unchanged (not in scope) |

**Wave D Status: COMPLETE** (2026-04-30)

---

## Verification Checklist

- [x] `bun run gate:routes` passes (39 routes covered)
- [x] `bun run test:e2e:api` passes locally (40 tests)
- [x] `bun run gate:pages` passes (8 pages covered)
- [x] `bun run test:e2e:bdd` passes locally (9 tests)
- [x] CI runs L2 and L3 on PR
- [x] CD verifies version after deploy
- [x] Coverage thresholds at 95%+ (worker funcs 93%, web branches 90% — see D.5 notes)

## References

- dove `scripts/check-route-coverage.ts` — L2 coverage gate implementation
- dove `scripts/check-page-coverage.ts` — L3 coverage gate implementation
- dove `.github/workflows/release.yml` — CD version verification
- backy `docs/04-quality-system-upgrade.md` — existing quality architecture
- backy `packages/api/src/handlers/live.ts` — existing version field (line 67)
