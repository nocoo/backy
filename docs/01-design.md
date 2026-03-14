# Backy - Design Document

AI backup management service. Receive, store, preview, and restore backups sent by SaaS AI agents via webhooks.

## Architecture

| Layer | Technology |
|---|---|
| Runtime | Bun |
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict mode) |
| UI | Tailwind CSS v4 + shadcn/ui (basalt design system) |
| Charts | Recharts |
| Validation | Zod v4 |
| Auth | NextAuth v5 + Google OAuth (whitelist) |
| Metadata DB | Cloudflare D1 (remote REST API, exponential backoff retry) |
| File Storage | Cloudflare R2 (S3-compatible API, AWS SDK v3) |
| Deployment | Railway + Docker (3-stage), port 7026 |
| Domain | backy.dev.hexly.ai |

## Data Model (D1)

### categories

| Column | Type | Description |
|---|---|---|
| id | TEXT PK | nanoid |
| name | TEXT | Category name |
| color | TEXT | Hex color (default `#6b7280`) |
| icon | TEXT | Lucide icon name (default `folder`) |
| sort_order | INTEGER | Display order |
| created_at | TEXT | ISO 8601 |
| updated_at | TEXT | ISO 8601 |

### projects

| Column | Type | Description |
|---|---|---|
| id | TEXT PK | nanoid |
| name | TEXT | Project name |
| description | TEXT? | Optional description |
| webhook_token | TEXT UNIQUE | Auto-generated, used by sender in Authorization header |
| allowed_ips | TEXT? | Comma-separated CIDR whitelist |
| category_id | TEXT? FK | → categories.id (ON DELETE SET NULL) |
| auto_backup_enabled | INTEGER | 0/1 flag |
| auto_backup_interval | INTEGER | Hours between auto-backups (default 24) |
| auto_backup_webhook | TEXT? | External webhook URL to trigger |
| auto_backup_header_key | TEXT? | Custom header name for auto-backup request |
| auto_backup_header_value | TEXT? | Custom header value for auto-backup request |
| created_at | TEXT | ISO 8601 |
| updated_at | TEXT | ISO 8601 |

### backups

| Column | Type | Description |
|---|---|---|
| id | TEXT PK | nanoid |
| project_id | TEXT FK | → projects.id (ON DELETE CASCADE) |
| environment | TEXT? | dev/prod, sender-defined |
| sender_ip | TEXT | Request IP |
| tag | TEXT? | Sender-defined label |
| file_key | TEXT | R2 object key (original file) |
| json_key | TEXT? | R2 object key (extracted JSON preview) |
| file_size | INTEGER | Bytes |
| file_type | TEXT | `json`, `zip`, `gz`, `tgz`, or `unknown` |
| is_single_json | INTEGER | 1 if archive contains a single .json file |
| json_extracted | INTEGER | 1 if user chose to extract JSON |
| created_at | TEXT | ISO 8601 |
| updated_at | TEXT | ISO 8601 |

### webhook_logs

| Column | Type | Description |
|---|---|---|
| id | TEXT PK | nanoid |
| project_id | TEXT? | Associated project (nullable for bad requests) |
| method | TEXT | HTTP method |
| path | TEXT | Request path |
| status_code | INTEGER | Response status |
| client_ip | TEXT? | Sender IP |
| user_agent | TEXT? | Sender user agent |
| error_code | TEXT? | Structured error code |
| error_message | TEXT? | Human-readable error |
| duration_ms | INTEGER? | Request duration |
| metadata | TEXT? | JSON string with extra context |
| created_at | TEXT | ISO 8601 |

### cron_logs

| Column | Type | Description |
|---|---|---|
| id | TEXT PK | nanoid |
| project_id | TEXT? FK | → projects.id (ON DELETE CASCADE) |
| status | TEXT | success/error/skipped |
| response_code | INTEGER? | HTTP status from triggered webhook |
| error | TEXT? | Error message |
| duration_ms | INTEGER? | Execution time |
| triggered_at | TEXT | ISO 8601 |

### Indexes

```
idx_backups_project_id      ON backups(project_id)
idx_backups_created_at      ON backups(created_at)
idx_backups_file_type       ON backups(file_type)
idx_projects_webhook_token  ON projects(webhook_token)
idx_projects_category_id    ON projects(category_id)
idx_webhook_logs_project_id ON webhook_logs(project_id)
idx_webhook_logs_created_at ON webhook_logs(created_at)
idx_webhook_logs_status_code ON webhook_logs(status_code)
idx_cron_logs_project_id    ON cron_logs(project_id)
idx_cron_logs_triggered_at  ON cron_logs(triggered_at)
idx_cron_logs_status        ON cron_logs(status)
```

## R2 Storage Layout

```
backy-bucket/
├── backups/{projectId}/
│   ├── {timestamp}.json          # JSON backup
│   ├── {timestamp}.zip           # ZIP archive
│   ├── {timestamp}.gz            # Gzip file
│   ├── {timestamp}.tar.gz        # Tarball
│   └── {timestamp}.{ext}         # Unknown type (preserves original extension)
└── previews/{projectId}/
    └── {timestamp}.json          # Extracted JSON preview
```

Timestamp format: `2026-03-02T10-30-00-000Z` (ISO 8601 with colons/dots replaced by dashes).

**Note:** Webhook uploads store files in their original format. Manual uploads (`/api/backups/upload`) auto-compress JSON files into ZIP for storage, with a raw JSON copy in `previews/` for preview.

## API Routes (24 files, 37 handlers)

### Auth
| Route | Methods | Description |
|---|---|---|
| `/api/auth/[...nextauth]` | GET, POST | NextAuth v5 handlers |

### Backups
| Route | Methods | Description |
|---|---|---|
| `/api/backups` | GET, DELETE | List (paginated, filterable), batch delete by IDs |
| `/api/backups/[id]` | GET, DELETE | Get/delete single backup |
| `/api/backups/[id]/download` | GET | Presigned download URL |
| `/api/backups/[id]/extract` | POST | Extract JSON from archive |
| `/api/backups/[id]/preview` | GET | Load JSON for tree preview |
| `/api/backups/upload` | POST | Manual file upload |

### Categories
| Route | Methods | Description |
|---|---|---|
| `/api/categories` | GET, POST | List/create categories |
| `/api/categories/[id]` | GET, PUT, DELETE | Get/update/delete category |

### Cron
| Route | Methods | Description |
|---|---|---|
| `/api/cron/trigger` | POST | Trigger auto-backup for all enabled projects |
| `/api/cron/trigger/[projectId]` | POST | Trigger auto-backup for single project |
| `/api/cron/logs` | GET, DELETE | List/delete cron logs |

### Infrastructure
| Route | Methods | Description |
|---|---|---|
| `/api/db/init` | POST | Initialize D1 schema + migrations |
| `/api/ip-info` | GET | IP geolocation proxy |
| `/api/live` | GET | Health check (D1 + R2 ping) |
| `/api/logs` | GET, DELETE | Webhook audit logs |

### Projects
| Route | Methods | Description |
|---|---|---|
| `/api/projects` | GET, POST | List/create projects |
| `/api/projects/[id]` | GET, PUT, DELETE | Get/update/delete project |
| `/api/projects/[id]/token` | POST | Regenerate webhook token |
| `/api/projects/[id]/prompt` | GET | AI agent integration prompt |

### Stats
| Route | Methods | Description |
|---|---|---|
| `/api/stats` | GET | Dashboard totals |
| `/api/stats/charts` | GET | Chart data (activity, projects, cron) |

### Webhook (public)
| Route | Methods | Description |
|---|---|---|
| `/api/webhook/[projectId]` | HEAD, GET, POST | HEAD: token verify, GET: project status, POST: receive backup |

### Restore (public)
| Route | Methods | Description |
|---|---|---|
| `/api/restore/[id]` | GET | Returns JSON with presigned R2 download URL (15 min TTL) |

## Pages

```
/login                        Google OAuth login (badge design)
/                             Dashboard (stats, 4 charts, recent backups)
/projects                     Project list (with categories)
/projects/new                 Create project
/projects/[id]                Project detail (settings, webhook, backups, danger zone)
/backups                      Global backup list (filter, search, multi-select, batch ops)
/backups/[id]                 Backup detail (metadata, JSON preview, download, restore)
/logs                         Webhook audit log viewer
/cron-logs                    Cron execution log viewer
```

## Webhook Protocol

### Sending a backup

```
POST /api/webhook/{projectId}
Authorization: Bearer {webhook_token}
Content-Type: multipart/form-data

Fields:
  file: (json, zip, gz, tgz, or any file)
  environment?: "dev" | "prod" | "staging" | "test" (optional)
  tag?: string (optional)
```

Supported file types: JSON, ZIP, GZ, TGZ, unknown (preserved as-is). File size limit: 50 MB.

### Checking status

```
HEAD /api/webhook/{projectId}
Authorization: Bearer {webhook_token}
→ 200 if token valid and IP allowed
→ 401 if missing/malformed Authorization header
→ 403 if invalid token, project mismatch, or IP restriction

GET /api/webhook/{projectId}
Authorization: Bearer {webhook_token}
→ JSON with project info and recent backup stats
```

### Restoring a backup

```
GET /api/restore/{backupId}?token={webhookToken}
  — or —
GET /api/restore/{backupId}
Authorization: Bearer {webhookToken}

→ Returns JSON: { url, backup_id, project_id, file_size, expires_in: 900 }
```

Auth uses the project's webhook token (query param or Bearer header).
The `url` field is a presigned R2 download link valid for 15 minutes.

## Security

- **Web UI**: Google OAuth + ALLOWED_EMAILS whitelist (single-user/small team)
- **Proxy** (`src/proxy.ts`): Next.js 16 convention, protects all routes except public whitelist
- **Webhook**: Per-project Bearer token (48-char nanoid)
- **IP restriction**: Project-level CIDR whitelist, fail-closed, IPv6-mapped stripping
- **Cron**: `CRON_SECRET` Bearer token
- **Restore**: Project webhook token via query param or Bearer header → returns presigned R2 URL (15 min TTL)
- **R2/D1**: Access keys stored as server-side environment variables
- **Client IP**: `x-envoy-external-address` (Railway Envoy) → `x-forwarded-for` rightmost → direct
- **E2E bypass**: `E2E_SKIP_AUTH=true` for local testing only
