# Production deploy (smallest complete path)

This repo can run as **Next.js web + worker + Redis**, with **Supabase hosted** (or local CLI for development). Production HTTP for the CRM is **port 3100** (`next start -p 3100`). The worker HTTP/Socket.IO port defaults to **4000**.

**Windows copy-paste commands:** [LITE-DEPLOY.md](./LITE-DEPLOY.md).

## Env

1. Copy [`.env.example`](../.env.example) to `.env` (Compose) and/or [`apps/web/.env.local.example`](../apps/web/.env.local.example) to `apps/web/.env.local` (local `next dev`).
2. Never commit `.env` / `.env.local`. `SUPABASE_SERVICE_ROLE_KEY` is server-only — it must not appear in client bundles (`NEXT_PUBLIC_*` only for URL + anon key).
3. Production cron routes require secrets:
   - `CRON_SECRET` — `/api/broadcasts/cron`, `/api/campaigns/cron` (`Authorization: Bearer …`)
   - `AUTOMATION_CRON_SECRET` — `/api/automations/cron`, `/api/flows/cron` (`x-cron-secret`)

## Hosted Supabase vs local CLI

| | Local (`npx supabase start` from `wacrm/`) | Hosted (supabase.com) |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` | `https://<ref>.supabase.co` |
| Anon / service_role | `npx supabase status` | Project Settings → API |
| Studio | `http://127.0.0.1:54323` | Dashboard |
| Migrations | applied on start | `npx supabase db push` or SQL editor |

Apply **migrations 001–current** in order (including GRANT migrations **031, 051–053**, **057** consents/landings, and **058–060** group lineage / jitter / A2A). Do not `supabase db reset` on a database you care about.

On **Windows Docker Desktop**, local `[analytics]` (Vector log router) and `[edge_runtime]` are **disabled** in `supabase/config.toml`. Vector cannot bind the Docker socket (`NetworkUnreachable`). This project has **no Edge Functions**. Hosted Supabase still has platform logs and can run functions if you add them later.

## Docker Compose

From `wacrm/`:

```bash
cp .env.example .env   # fill secrets
docker compose up -d --build
```

- Web: http://localhost:3100 — health `GET /api/health`
- Worker: http://localhost:4000/health
- Redis: localhost:6379
- Postgres is **not** in this Compose file; point env at hosted Supabase (or keep local `supabase start` and set URL to `http://host.docker.internal:54321` from containers).

Without Docker:

```bash
npm install
npm run build --workspace=@wacrm/shared
npm run build --workspace=@wacrm/web
npm run build --workspace=@wacrm/worker
npm run start --workspace=@wacrm/web     # :3100
npm run start --workspace=@wacrm/worker  # uses process env, not --env-file
```

Worker `start` reads the environment. Locally it still falls back to `apps/web/.env.local` if `NEXT_PUBLIC_SUPABASE_URL` is unset.

## Scheduled jobs (broadcasts, campaigns, automations)

Those features need a pinger every few minutes:

- **GitHub Actions:** this repo’s [`.github/workflows/scheduled-jobs.yml`](../../.github/workflows/scheduled-jobs.yml) (monorepo root). Set secrets `APP_URL`, `CRON_SECRET`, and `AUTOMATION_CRON_SECRET`.
- **crontab / Hostinger:**  
  `*/5 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://crm.example.com/api/broadcasts/cron`

Without a scheduler, **Send now** still works; **Schedule** and drip campaigns will sit in `scheduled` until something hits the cron routes.

## Socket.IO

The worker depends on `socket.io` and listens on `WORKER_SOCKET_PORT`. CORS is locked to `NEXT_PUBLIC_SITE_URL` (plus optional `SOCKET_CORS_ORIGINS`). It does **not** reflect arbitrary Origins. The Settings QR flow **polls the `sessions` table** and does not require a browser Socket.IO client. Treat Socket.IO as optional realtime; pairing still works if the browser never connects to port 4000.

## Windows installs

Workspace `npm install` needs directory junctions unless Developer Mode is on. This repo ships `.npmrc` with `install-links=true` and `install-strategy=nested` so packages are copied instead of symlinked. After that, `npm install` from `wacrm/` should work without admin rights.

Local **dev** on Windows often needs webpack (Turbopack postcss can fail on a nested install):

```bash
npm run dev:webpack --workspace=@wacrm/web   # :3100
```

Production still uses `next build` + `next start -p 3100`, not webpack. To prove a production build while webpack still owns `.next`, set `NEXT_DIST_DIR=.next-prod` for that build only.

## Security headers

Production (`NODE_ENV=production`) sends an enforcing `Content-Security-Policy`. `next dev` stays Report-Only so HMR is not blocked.

## Health

- Web: `GET /api/health`
- Worker: `GET /health` or `GET /api/health` on the worker port
