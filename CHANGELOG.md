# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.1.0]: https://github.com/nocoo/backy/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/nocoo/backy/releases/tag/v1.0.0
