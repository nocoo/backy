# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.2.0]: https://github.com/nocoo/backy/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/nocoo/backy/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/nocoo/backy/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/nocoo/backy/releases/tag/v1.0.0
