<p align="center">
  <img src="../assets/brand/icon-rounded.png" alt="Backy" width="128" height="128" />
</p>
<h1 align="center">Backy</h1>
<p align="center">Collect application backups, inspect content and history by project, and retrieve the original files.</p>
<p align="center">
  <a href="https://backy.hexly.ai">Website</a> ·
  <a href="../README.md">简体中文</a>
</p>

## What it does

Backy provides a shared backup receiver for applications, scripts, and AI clients. Each project has its own webhook token. After a sender uploads a file, maintainers can inspect records, preview JSON, review failure logs, and generate a download URL from the web console.

The application runs on Cloudflare Workers: Hono serves APIs and scheduled jobs, D1 stores metadata, and R2 stores files. The Worker also serves the Vite / React dashboard. Backy stores and returns backup files; the connected application remains responsible for exporting and importing its business data.

## Features

- **Backup ingestion**: upload through the dashboard or project webhook, preserving JSON, ZIP, gzip, tar.gz, and other files with environment, tags, and sender IP. Ordinary uploads allow up to 50 MiB; larger files use direct R2 upload, up to 5,000,000,000 bytes.
- **Project management**: projects and categories, separate tokens, optional IP / CIDR allowlists, and copyable integration instructions.
- **Inspection**: browse backups, storage statistics, and activity charts; preview JSON and extract it from supported archives. Preview and extraction limits apply, while original files remain downloadable.
- **File retrieval**: generate temporary signed download URLs or restore commands for applications and AI clients. Backy does not modify the caller's database.
- **Scheduled triggers and records**: configure a backup callback and schedule per project, review webhook / cron logs, and clean temporary objects left by incomplete direct uploads.

## Usage

Open the [dashboard](https://backy.hexly.ai), sign in through Cloudflare Access, create a project, and obtain its ID and token. Self-hosted instances need suitable Access rules for integration paths; browser sessions and project tokens are separate authentication mechanisms.

Use your own instance and project in this example to check the token and upload a file:

```bash
BACKY_URL=https://backy.example.com
BACKY_PROJECT_ID=YOUR_PROJECT_ID
BACKY_TOKEN=YOUR_PROJECT_TOKEN

curl --fail-with-body --head "$BACKY_URL/api/webhook/$BACKY_PROJECT_ID" \
  -H "Authorization: Bearer $BACKY_TOKEN"
curl --fail-with-body "$BACKY_URL/api/webhook/$BACKY_PROJECT_ID" \
  -H "Authorization: Bearer $BACKY_TOKEN" \
  -F "file=@backup.json" -F "environment=dev" -F "tag=manual-backup"
```

A successful upload returns a backup ID. GET on the same endpoint returns the project's backup total and recent records. `?environment=dev` filters recent records; supported environments are `dev`, `prod`, `staging`, and `test`. The filter does not change the project-wide total in the response.

Replace `BACKUP_ID` with the upload response's ID to retrieve a backup:

```bash
curl --fail-with-body "$BACKY_URL/api/restore/BACKUP_ID" \
  -H "Authorization: Bearer $BACKY_TOKEN"
```

The response's `url` is a download URL valid for 15 minutes. After downloading, use the application's own import process. Large files require the initialize → PUT to R2 → complete protocol described in [direct uploads](09-large-file-direct-upload.md). `apps/cli` is currently a placeholder package; use the HTTP API for integrations.

## Development

Install Bun and Node.js 22.12+, then run:

```bash
git clone https://github.com/nocoo/backy.git
cd backy
bun install --frozen-lockfile
bun run build
```

The website builds into `apps/worker/static/` for the Worker to serve. `bun run build` does not create a database or deploy a service.

For interactive development, first prepare your own development resources and authentication entry point, then run:

```bash
bun run dev
```

Vite serves `http://localhost:7017` and proxies `/api/*` to the Worker on port 7018. Both D1 and R2 in `apps/worker/wrangler.toml` use `remote = true`, so the default command accesses those remote resources. Replace them with your own development database, bucket, and Access configuration. Local secrets belong in `apps/worker/.dev.vars`; the repository has no template for this file. See the [development guide](10-development.md) for configuration and initialization details.

| Configuration | Purpose |
| --- | --- |
| `DB`, `R2` bindings | D1 database and R2 file storage |
| `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` | Access JWT validation for management APIs; the development entry point must supply the expected authentication |
| `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Download signing, direct-upload signing, and object copying |
| `CRON_SECRET` | Automatic backup triggers and their HTTP endpoint |

Keep test authentication flags out of ordinary development. Use the existing test runners below for entirely local D1, R2, and test identities.

| Command / path | Purpose |
| --- | --- |
| `bun run web:dev`, `bun run worker:dev` | Start the frontend and Worker separately |
| `bun run typecheck`, `bun run lint` | Workspace type and code checks |
| `apps/web/` | Dashboard and frontend routes |
| `apps/worker/` | Hono routes, Access verification, scheduled jobs, and static assets |
| `packages/api/` | Backup, storage, project, direct-upload, and logging logic |

After CI succeeds on `main`, the Release workflow builds the website, applies incremental D1 migrations, and deploys the Worker. `bun run worker:deploy` only deploys the Worker; prepare static files and the database before a manual release. See [deployment details](10-development.md).

## Tests

```bash
bun run test
bun run test:e2e:api
```

Unit tests cover the workspaces. The API runner uses a local Worker, D1, and R2, initializes the schema, and checks `_test_marker`. Keep port 17018 available. Direct-upload tests use the local S3 endpoint.

```bash
bunx playwright install chromium
bun run test:e2e:bdd
```

The browser runner builds the website first and also uses port 17018; run the two runners sequentially. API and browser tests recreate `apps/worker/.wrangler/e2e-api` and `apps/worker/.wrangler/e2e-bdd`, respectively, with test identities injected by the runner. These commands require no remote Cloudflare credentials. Simulated sessions do not validate real Access sign-in.

## Stack

| Technology | Purpose |
| --- | --- |
| TypeScript, Bun workspaces | Shared types, business packages, and scripts |
| Vite, React, React Router | Dashboard and frontend routing |
| Tailwind CSS, Radix UI, Recharts | Styling, interactive components, and charts |
| Hono, Cloudflare Workers | HTTP APIs, scheduled jobs, and static assets |
| Cloudflare D1 | Projects, backups, direct-upload state, and logs |
| Cloudflare R2, AWS S3 SDK | File storage, signed URLs, and object copying |
| Cloudflare Access, jose | Administrative identity and JWT validation |
| JSZip, tar-stream, zlib | JSON extraction from archives |
| Vitest, Bun test, Playwright | Unit, HTTP, and browser tests |

## Documentation

- [Documentation index](README.md)
- [Development, configuration, and deployment](10-development.md)
- [Large-file direct-upload protocol](09-large-file-direct-upload.md)
- [Shared API package design](06-api-extraction-plan.md)
- [Vite / Worker architecture migration](07-vite-web-migration-plan.md)

## License

[MIT](../LICENSE).
