# ARCHITECTURE — WaCRM (Doral base)

**Repo:** `shaashish1/wacrm`  
**Constraint:** 3 Compose containers + hosted Supabase. No extra runtimes.  
**Companions:** [BASELINE.md](./BASELINE.md), [production.md](./production.md), [mcp.md](./mcp.md), [PLAN-doral-healthcare.md](./PLAN-doral-healthcare.md)

This file describes the **chosen** stack. It does not implement product code.

---

## Runtime (lite deploy)

```
                    +-----------------+
   Browser / cron   |  web  :3100     |  Next.js (apps/web)
   MCP / /api/v1    |  A2A lives here |  Route Handlers, no extra process
                    +--------+--------+
                             |
                             |  hosted Supabase (Postgres + Auth)
                    +--------v--------+
                    |  Redis  :6379   |  BullMQ / queues
                    +--------+--------+
                    +--------v--------+
                    |  worker :4000   |  Baileys / Cloud API, Socket.IO optional
                    +-----------------+
```

| Piece | Role | Port / where |
| --- | --- | --- |
| `web` | Dashboard, `/api/*`, `/api/v1`, future A2A cards + JSON-RPC | `:3100` — `GET /api/health` |
| `worker` | WhatsApp send/receive, sessions volume, BullMQ drain | `:4000` — `GET /health` |
| `redis` | Queues | `:6379` |
| Hosted Supabase | Postgres, Auth, RLS, migrations `001`–current | Not in Compose |

**Not in v1 Compose:** local Postgres, Vector analytics, Edge Functions, agent sidecars, Kubernetes, a waapi-gateway.

Cron is GitHub Actions (`scheduled-jobs.yml`) or host crontab hitting existing broadcast/campaign/automation/flow routes with `CRON_SECRET` / `AUTOMATION_CRON_SECRET`. Socket.IO is optional; QR pairing polls `sessions`.

Deploy steps, Windows notes, and env rules: [production.md](./production.md).

---

## A2A vs MCP

Keep **both**. They are different layers.

| | MCP (exists) | A2A (Phase 4, planned) |
| --- | --- | --- |
| Relationship | **Agent → tools / data** | **Agent → agent** |
| Today | `mcp-server/` → `wacrm-mcp` wrapping `/api/v1` | None |
| State | Stateless tool calls | Stateful **tasks** (`submitted` → `working` → done / failed / `input-required`) |
| Contract | Tool schema | Agent Card + skills |
| Writes | Opt-in `WACRM_ENABLE_WRITES` / broadcasts | Per-skill; Broadcast Compliance is a **gate**, not a tool wrapper |
| Who | Cursor, Claude Desktop, Ashish | In-app specialists; later external cards |

**Rule:** Agents call MCP (or internal TS services) to read/write CRM. Agents call A2A to ask another agent to reason and decide. Do not replace MCP. Do not wrap Lead Qualifier as one MCP tool.

v1 A2A is **same-origin** inside the web app (`apps/web/src/lib/a2a/`, cards at `/api/a2a/:agentId/agent-card.json`). No public registry, no new container. Pin JSON-RPC 2.0 subset: SendMessage, GetTask, CancelTask, GetAgentCard. Streaming optional.

Do not expose raw `send_message` / broadcasts to the Concierge without a Compliance task success (or the equivalent server function).

---

## Adjacent repos — not in this architecture

`whatsapp-research` and `omnichat` are **not** services, not Compose extras, and not merge sources. Booking/consent UX may be **reimplemented** against WaCRM contacts + a thin `appointments` table. Do not port omnichat voice, their schema, or the research apps.

---

*End of ARCHITECTURE. Product rules: [PRD-doral-healthcare.md](./PRD-doral-healthcare.md).*
