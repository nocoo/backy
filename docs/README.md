# Backy Documentation

[中文项目说明](../README.md) · [English README](README.en.md)

Start with [development, configuration, and integration](10-development.md) for current local runners, Access / R2 requirements, backup limits, and deployment. Older Next.js / Railway and remote-test plans retain historical context; they are not the current setup instructions.

## Active Documents

| # | Document | Description |
|---|---|---|
| 01 | [Design](01-design.md) | Architecture, data model, API routes, security |
| 04 | [Quality System Upgrade](04-quality-system-upgrade.md) | L1+L2+L3+G1+G2 quality system migration plan |
| 05 | [Test Resource Isolation](05-test-resource-isolation.md) | (Historical) Original remote D1+R2 isolation plan — now superseded by `--local --persist-to` |
| 06 | [API Extraction Plan](06-api-extraction-plan.md) | Wave-by-wave plan to split @backy/api out of apps/web |
| 07 | [Vite Web Migration](07-vite-web-migration-plan.md) | Vite + Worker migration plan |
| 08 | [L2/L3 Coverage Gates](08-l2-l3-coverage-gates.md) | E2E coverage gates + CD version verification |
| 09 | [Large File Direct Upload](09-large-file-direct-upload.md) | R2 presigned PUT ingest alongside the multipart path |
| 10 | [Development and Integration](10-development.md) | Current configuration, local tests, HTTP integrations, and deployment |

## Archive

Completed plans and historical reports.

| Document | Description |
|---|---|
| [Testing Upgrade Plan](archive/02-testing-upgrade-plan.md) | 3-tier → 4-tier testing migration (completed) |
| [Impeccable Audit Report](archive/03-impeccable-audit-report.md) | Frontend quality audit 2026-03-07 (all fixes committed) |
