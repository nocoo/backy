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
