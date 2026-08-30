# Lite deploy — Doral (web + worker + Redis + hosted Supabase)

This is the **only** production shape until someone explicitly changes it. No local Postgres, Vector, Edge Functions, or extra agent containers.

Companions: [production.md](./production.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [BASELINE.md](./BASELINE.md).

## What runs

| Service | Port | Health |
| --- | --- | --- |
| `web` (Next.js) | **3100** | `GET http://localhost:3100/api/health` |
| `worker` (Baileys / Cloud API + BullMQ) | **4000** | `GET http://localhost:4000/health` |
| Redis 7 | 6379 | Compose healthcheck (`redis-cli ping`) |
| Hosted Supabase | — | Not in Compose. Point env at `https://<ref>.supabase.co` |

## 1. Env (no secrets in git)

From `wacrm/` (this folder):

```powershell
copy .env.example .env
```

Fill at least:

- `NEXT_PUBLIC_SITE_URL` — public origin, no trailing slash. Local: `http://localhost:3100`
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — hosted project Settings → API
- `SUPABASE_SERVICE_ROLE_KEY` — server-only. Never `NEXT_PUBLIC_`.
- `ENCRYPTION_KEY` — 64 hex chars
- `CRON_SECRET` / `AUTOMATION_CRON_SECRET`
- `REDIS_URL` — Compose overrides this to `redis://redis:6379` inside the stack

Do **not** commit `.env`. Do **not** put the service role key in a `NEXT_PUBLIC_*` variable.

Local `next dev` also reads `apps/web/.env.local` (copy from `apps/web/.env.local.example`).

## 2. Hosted Supabase migrations

Apply **001–current** in order on the Doral project (include GRANT migrations **031, 051–053**). Do **not** `supabase db reset` on a database you care about.

```powershell
npx supabase db push
```

Or paste SQL from `supabase/migrations/` in the dashboard SQL editor, oldest first.

## 3. Start the stack

Docker Desktop must be running. From `wacrm/`:

```powershell
docker compose up -d --build
```

Then:

```powershell
curl http://localhost:3100/api/health
curl http://localhost:4000/health
```

Both should return OK. Open the CRM at **http://localhost:3100**.

Stop without deleting volumes:

```powershell
docker compose stop
```

## 4. Windows notes

- Workspace `npm install` needs directory junctions unless Developer Mode is on. This repo ships `.npmrc` with `install-links=true` and `install-strategy=nested` so packages are copied instead of symlinked.
- Local **dev** (not Compose) often needs webpack because Turbopack + postcss can fail on a nested install:

```powershell
npm run dev:webpack --workspace=@wacrm/web
```

That still listens on **3100**. Production in Docker is `next start -p 3100`, not webpack.

- If you prove a production build while webpack still owns `.next`, set `NEXT_DIST_DIR=.next-prod` for that build only.

## 5. Cron (scheduled broadcasts / drips)

Without a pinger, **Send now** works; **Schedule** and email drips sit in `scheduled`.

- GitHub Actions: [`.github/workflows/scheduled-jobs.yml`](../../.github/workflows/scheduled-jobs.yml) with secrets `APP_URL`, `CRON_SECRET`, `AUTOMATION_CRON_SECRET`.
- Or crontab / hPanel:

```text
*/5 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://YOUR_HOST/api/broadcasts/cron
```

## 6. Smoke (do not blast)

Pair **one** test number. Confirm inbox send/receive. Do **not** send a broadcast to the full contact list — marketing sends require a consent row (landing opt-in) and are blocked for `opted_out` / no-consent.

## Without Docker

```powershell
npm install
npm run build --workspace=@wacrm/shared
npm run build --workspace=@wacrm/web
npm run build --workspace=@wacrm/worker
npm run start --workspace=@wacrm/web
npm run start --workspace=@wacrm/worker
```

Web is still **:3100**. Worker reads process env (falls back to `apps/web/.env.local` if `NEXT_PUBLIC_SUPABASE_URL` is unset). You need Redis reachable at `REDIS_URL`.
