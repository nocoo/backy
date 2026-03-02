# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.4.0]: https://github.com/nocoo/backy/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/nocoo/backy/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/nocoo/backy/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/nocoo/backy/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/nocoo/backy/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/nocoo/backy/releases/tag/v1.0.0
