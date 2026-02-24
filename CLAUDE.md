# Backy

AI backup management service. Receive, store, preview, and restore backups sent by SaaS AI agents via webhooks.

## Tech Stack

| Component | Choice |
|---|---|
| Runtime | Bun |
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict mode) |
| UI | Tailwind CSS v4 + shadcn/ui (basalt design system) |
| Auth | NextAuth v5 + Google OAuth (whitelist) |
| Metadata DB | Cloudflare D1 (remote REST API) |
| File Storage | Cloudflare R2 (S3-compatible API) |
| Deployment | Railway + Docker, port 7026 |
| Domain | backy.dev.hexly.ai |

## Three-Tier Testing

| Layer | Tool | Trigger | Requirement |
|---|---|---|---|
| UT | bun test | pre-commit | 90%+ coverage |
| Lint | eslint | pre-commit | Zero errors/warnings |
| E2E | bun run test:e2e | pre-push | BDD pattern |

### Core Principles

1. **Catch early** — no accumulating tech debt
2. **Self-resolve** — no relying on manual review for basic errors
3. **Quality gate** — bad code cannot enter main branch

## Common Commands

```bash
bun dev              # Dev server (7026)
bun run build        # Production build
bun test             # Unit tests
bun run lint         # ESLint
```

## Retrospective

- **AWS SDK v3 Body is not ReadableStream**: When using `@aws-sdk/client-s3` `GetObjectCommand`, the `response.Body` is a `SdkStreamMixin` (not a Web `ReadableStream`). Must use `body.transformToByteArray()` or `body.transformToString()` instead of `body.getReader()`. This caused 500 errors in preview and extract routes — caught by E2E.
- **Bun's `typeof fetch` requires `preconnect`**: When mocking `globalThis.fetch` in Bun tests, the type includes a `preconnect` property. Use a helper function that adds `fn.preconnect = () => {}` to satisfy the type.
- **E2E self-bootstrap pattern**: The `backy-test` project (ID: `mnp039joh6yiala5UY0Hh`) is permanently available in D1 for E2E testing. Tests upload real data, verify round-trip, then clean up. Uses `E2E_SKIP_AUTH=true` to bypass OAuth for protected routes during local testing.
- **D1 timeout (error 7429) needs retry**: Cloudflare D1 HTTP API can return transient `7429` timeout errors (`D1 DB storage operation exceeded timeout which caused object to be reset.`) even for simple INSERT queries. Without retry logic, this causes 500s in the webhook POST endpoint. Fixed by adding exponential backoff retry (3 attempts, 500/1000/2000ms) to `executeD1Query` in `d1-client.ts`.
