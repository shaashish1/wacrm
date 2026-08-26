# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Build and Dev Commands

This is an npm workspaces monorepo (no Turborepo). All root scripts delegate via `--workspaces --if-present`.

```bash
npm run dev          # Start web app (Turbopack, port 3000)
npm run build        # Production build (all workspaces)
npm run lint         # ESLint (all workspaces)
npm run typecheck    # tsc --noEmit (web app)
npm run test         # vitest run (web app)
npm run format       # Prettier write (web app)
```

### Running a single test
```bash
cd apps/web && npx vitest run src/path/to/file.test.ts
```

### Worker (Baileys WhatsApp provider)
```bash
cd apps/worker && npm run dev   # nodemon + tsx, watches src/
```

### Shared package
```bash
cd packages/shared && npm run dev   # tsc -w
```

## Architecture

**Monorepo layout:**
- `apps/web` — Next.js 16 App Router (frontend + API routes). This is the main application.
- `apps/worker` — Standalone Node.js process for the Baileys (unofficial WhatsApp Web) provider.
- `packages/shared` — TypeScript types and the `IMessagingProvider` interface shared across apps.
- `supabase/migrations/` — 40 sequential SQL migrations defining the full schema.
- `mcp-server/` — MCP server (`wacrm-mcp` on npm) for AI assistant integration.
- `e2e/` — Playwright e2e test stubs.

**Dual WhatsApp provider model:**
The system supports two WhatsApp providers behind a shared `IMessagingProvider` interface (`packages/shared/src/providers.ts`):

1. **Cloud API** (official Meta API) — implemented in `apps/web/src/lib/providers/cloud-api-provider.ts`. Direct `fetch` calls to `graph.facebook.com`. Supports templates and interactive messages.
2. **Baileys** (unofficial WA Web) — implemented in `apps/worker/src/providers/baileys-provider.ts`. Runs in the worker process. Does NOT support templates or interactive messages.

The provider factory (`apps/web/src/lib/providers/factory.ts`) reads `accounts.provider_type` (`cloud_api` | `wwebjs`) and returns the correct implementation.

**Web <-> Worker communication:**
- Web enqueues messages to BullMQ queue `wwebjs-messages`; worker processes them via `QueueProcessor`.
- Worker normalizes inbound Baileys events into Meta-format webhook payloads and POSTs them (HMAC-signed) to the web app's `/api/whatsapp/webhook` endpoint via a `webhook-dispatch` BullMQ queue.
- Redis is the transport layer (`REDIS_URL`, default `redis://localhost:6379`).
- The webhook route processes both real Meta webhooks and worker-dispatched payloads identically.

**Webhook processing priority:** The flow runner (`apps/web/src/lib/flows/`) gets first priority on inbound messages. If a flow consumes the message, automations are suppressed for it.

**Database:** Supabase (Postgres + Auth + Storage + Realtime). No ORM — all queries use the Supabase JS client (PostgREST). Every table has Row-Level Security via `is_account_member(account_id, min_role)`.

**API layers:**
- Internal routes: `/api/whatsapp/*`, `/api/account/*`, `/api/ai/*`, `/api/automations/*`, `/api/flows/*`, etc.
- Public REST API: `/api/v1/*` — uses bearer token auth with scoped API keys (SHA-256 hashed), not Supabase sessions. Documented in `docs/public-api.md`.

## Key Conventions

**Auth and roles:** Supabase Auth with four roles: `viewer` (1) < `agent` (2) < `admin` (3) < `owner` (4). Role checks happen in `apps/web/src/lib/auth/roles.ts` (capability predicates) and in SQL via RLS. `getCurrentAccount()` in `apps/web/src/lib/auth/account.ts` resolves user -> profile -> account. The `AuthProvider` hook (`apps/web/src/hooks/use-auth.tsx`) exposes derived booleans (isOwner, isAdmin, canManageMembers, etc.).

**Supabase clients:** Server client reads cookies from `next/headers` (`@supabase/ssr`). Browser client is a singleton to avoid auth-lock contention. The worker uses a service-role client (no user session).

**UI:** shadcn/ui (base-nova style) with `@base-ui/react`, Tailwind CSS v4 (`@tailwindcss/postcss`), lucide-react icons. Styling uses `class-variance-authority` + `clsx` + `tailwind-merge`.

**i18n:** `next-intl` with locale files in `apps/web/messages/` (en, ko).

**Encryption:** AES-256-GCM for WhatsApp access tokens and API keys (`apps/web/src/lib/whatsapp/encryption.ts`). HMAC-SHA256 for webhook signature verification.

**Rate limiting:** In-memory fixed-window rate limiter (`apps/web/src/lib/rate-limit.ts`) with preconfigured budgets per action type. Worker has its own `RateGovernor` for Baileys (250 msgs/day + warming jitter).

**Formatting:** Prettier with semicolons, single quotes, trailing commas (es5), 80-char width, tailwindcss plugin. Run `npm run format` before committing.

## CI

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on PRs to main: lint -> typecheck -> test -> build. All four must pass.
