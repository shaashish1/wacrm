# PLAN — Doral Healthcare and Wellness

**Implements:** [PRD-doral-healthcare.md](./PRD-doral-healthcare.md)  
**Repo:** `shaashish1/wacrm`  
**Operator:** Ashish  
**Date:** 2026-08-30  
**Constraint:** Lite deploy only (web + worker + Redis + hosted Supabase). Planning docs first; this file does not implement product code.

Effort: **S** ≤ ~3 days, **M** ~1–2 weeks, **L** ~3–6 weeks (one operator, part-time).

---

## Principles

1. **Freeze then extend.** Do not fork a second WhatsApp stack. Adjacent repos are references.
2. **Compliance before volume.** Consent + STOP + PHI deny-list land before Content agent or ads.
3. **MCP stays.** A2A is an adapter beside it, not a replacement (`docs/mcp.md` vs new `docs/a2a.md` in Phase 4).
4. **Same-origin A2A in v1.** Cards + JSON-RPC on the Next.js app. No public agent registry.
5. **Cloud API for Doral sends** unless Ashish explicitly needs Baileys group admin in production.

---

## Phase 0 — Freeze WaCRM as base

**Goal:** One chosen codebase. Everyone builds on current `main`, not omnichat / research / a new gateway.

### Deliverables

- [x] This PLAN + PRD in `docs/`.
- [ ] Tag or note `BASELINE` commit SHA on `main` after docs land (Ashish records it).
- [ ] Short `docs/BASELINE.md` (10 lines): stack, ports 3100/4000, hosted Supabase, “do not merge adjacent repos.”
- [ ] Inventory checklist signed off against live `main`: inbox, contacts, contact-groups, wa-groups sync/import, broadcasts, campaigns/email, automations, flows, pipelines, agents playground, MCP, `/api/v1` (me, messages, contacts, conversations, broadcasts, webhooks).
- [ ] Decision log: Cloud API vs Baileys for Doral production sends.

### Dependencies

- Access to `D:/Projects/whatsapp/wacrm` and hosted Supabase project.
- Read-only look at `whatsapp-research` / `omnichat` for booking/consent ideas.

### Out of scope

- Feature work, schema changes, theme, A2A code.
- Merging other repos.

### Effort

**S**

### Risks

- Drift: someone keeps patching omnichat. Mitigation: all Doral tickets target `wacrm` only.

---

## Phase 1 — Lite compose + hosted Supabase

**Goal:** Doral (or Ashish laptop/VPS) can run the frozen base the same way production.md describes.

### Deliverables

- [x] `.env` from `.env.example`; no secrets in git. Compose + example are the lite path; see `docs/LITE-DEPLOY.md`.
- [ ] `docker compose up -d --build` → web `:3100` `/api/health`, worker `:4000` `/health`, Redis healthy. (Operator: stack was stopped at implement time.)
- [ ] Hosted Supabase: migrations applied in order through current (include GRANT migrations 031, 051–053, and **057** consents/landings). No `db reset` on the real project.
- [ ] Cron: GitHub `scheduled-jobs.yml` **or** crontab hitting broadcasts/campaigns/automations/flows with `CRON_SECRET` / `AUTOMATION_CRON_SECRET`.
- [ ] Pair **one** test number (Cloud API preferred). Inbox send/receive smoke.
- [x] Confirm Windows notes: `.npmrc` nested installs; webpack for local `next dev` if needed. Production = `next start -p 3100`. Documented in `docs/LITE-DEPLOY.md`.

### Dependencies

- Phase 0 baseline.
- Supabase project + Meta app (or Baileys session volume) for smoke only.

### Out of scope

- New marketing tables, A2A, REST expansion, visual redesign.
- Local Supabase as the production path (OK for Ashish’s own dev only).

### Effort

**S–M** (M if Meta Business verification or Windows Docker is messy)

### Risks

- Worker session volume / QR pairing vs Cloud API webhook URL.
- Cron not configured → scheduled drips sit in `scheduled`. Mitigation: document “Send now” vs schedule.
- `SUPABASE_SERVICE_ROLE_KEY` leaked to client. Mitigation: existing rule; verify build.

---

## Phase 2 — Full REST + group admin + sync

**Goal:** Anything marketers and agents will automate is available on `/api/v1` and WA groups are operable, not just listed.

### Deliverables

**REST (same auth: hashed API keys, scopes, envelope, 120 rpm):**

- [ ] `contact-groups` CRUD + members (UI exists; public API incomplete).
- [ ] `campaigns` read/enroll/pause (scopes: e.g. `campaigns:read`, `campaigns:send`).
- [ ] `pipelines` / `deals` read+write (minimal).
- [ ] `wa-groups` read + trigger sync; admin actions behind `groups:admin`.
- [ ] `consents` read (after Phase 3 schema — if Phase 2 lands first, stub route + ship with Phase 3).
- [ ] Update `docs/public-api.md`. MCP tools may wrap new read endpoints (writes still opt-in).

**Group admin + sync (Baileys worker; Cloud API groups are limited):**

- [ ] Reliable sync: subject, size, participants, announce/restrict flags (partially exists in worker upsert).
- [ ] Admin actions if the paired number is admin: add/remove participant, promote/demote, update subject — **not** in worker today.
- [ ] UI on `/wa-groups` for those actions + error if not admin.
- [ ] Import-to-contacts remains; do not auto-market imported phones without consent (Phase 3).

### Dependencies

- Phase 1 healthy worker (group admin needs Baileys). If Doral is Cloud-API-only, **group admin is deferred** and this phase is REST-only (shrink to **M**).

### Out of scope

- Landing pages, UTM, A2A.
- A standalone waapi-gateway process.

### Effort

**L** if group admin + REST; **M** if REST only.

### Risks

- Baileys ban from aggressive group writes. Mitigation: rate-governor; Cloud API for marketing.
- Scope explosion (“full REST” = every internal route). Mitigation: only the list above.

---

## Phase 3 — Marketing module (leads, campaigns, consent)

**Goal:** Doral can run a campaign that is legal to send: attributed lead → consent → audience → drip/broadcast.

### Deliverables

**Schema (hosted Supabase migrations):**

- [x] `consents` (account_id, contact_id, channel, source, consented_at, copy, revoked_at, meta JSON).
- [x] Lead attribution on `contacts` or `leads`: `utm_*`, `landing_id`, `first_touch_at`, `last_touch_at`.
- [x] `landing_pages` (slug, title, body JSON, form config, published).
- [ ] `marketing_campaigns` **or** FK from existing `campaigns` / `broadcasts` to a campaign wrapper (prefer wrapper to avoid rewriting drip engine).
- [ ] PHI / sensitive **deny-list** config (account-level JSON) + check on custom field names/values, notes, KB ingest.

**Product:**

- [x] Public `GET /p/[slug]` + POST form → find-or-create contact, write consent, store UTM from query.
- [x] Audience resolve: contact group **intersect** consent + not `opted_out`.
- [x] Broadcast + campaign engine: refuse send without consent (server-side, not only UI).
- [x] STOP already sets `opted_out`; also revoke WA consent row.
- [ ] Email: List-Unsubscribe + unsub route; parity with WA.
- [x] Marketer UI: landing create/list in Settings (minimal). Consent badge on contact still open.
- [ ] Content calendar table + simple week view (**P1** — can ship end of this phase or start of Phase 5).

**Copy defaults for Doral:**

- [ ] STOP footer on marketing templates.
- [ ] Form checkbox text stored verbatim.

### Dependencies

- Phase 1. Phase 2 REST for campaigns/groups is useful but **consent gates must work in the web app even if v1 API lags**.
- Existing `campaigns`, `contact_groups`, `opt-out.ts`.

### Out of scope

- Ads Manager, Meta CAPI (P2).
- Full CMS, blog, SEO suite.
- Clinical intake forms.

### Effort

**L**

### Risks

- Marketers import WA group members and blast. Mitigation: import creates contacts **without** marketing consent; UI warning.
- Deny-list false positives (“pain” in wellness copy). Mitigation: tunable list; Compliance agent in Phase 4 reviews context.
- HIPAA misunderstanding: staff think consent makes WhatsApp HIPAA. Mitigation: UI banner — marketing only.

---

## Phase 4 — In-app agents + A2A adapter

**Goal:** Five specialists exist in the product. They talk A2A. MCP still drives CRM tools.

### A2A vs MCP (implementation)

| Layer | What to build |
| --- | --- |
| Tools | Keep `mcp-server` → `/api/v1`. Add scopes as Phase 2/3 APIs land. |
| Agents | New `apps/web/src/lib/a2a/` : Agent Card types, JSON-RPC handler, task store. |
| SDK | Prefer `@a2a-js/sdk` if it stays small; else ~200 LOC JSON-RPC. Spec: https://a2a-protocol.org/latest/specification/ |
| Cards | `GET /api/a2a/:agentId/agent-card.json` (and optional well-known for the concierge). |
| Tasks | Table `a2a_tasks` (state, context_id, artifacts JSON, created_by). Scan artifacts with deny-list. |
| Auth | Reuse API keys with scope `a2a:invoke` for external; session cookie for in-app. |

**Do not** expose `send_message` / broadcasts as raw MCP to the Concierge without Compliance task success.

### Deliverables

**P0 agents**

- [ ] Lead Qualifier — inbound hook after webhook (and playground).
- [ ] Broadcast Compliance — called from broadcast/campaign send path (hard gate).

**P1 agents**

- [ ] Content — drafts only; always followed by Compliance.
- [ ] Booking/Receptionist — `appointments` + slot offer; optional Google Calendar (pattern from omnichat docs, new code).
- [ ] Analytics — funnel aggregates; no bodies in artifacts.

**Product**

- [ ] `/agents` UI: list cards, skills, recent tasks (keep existing playground as Concierge test).
- [ ] `docs/a2a.md` — how to add a card, task states, MCP relationship.
- [ ] System prompts + deny-list shared module.
- [ ] Escalation: `input-required` or `escalate` → human assignment in inbox.

### Dependencies

- Phase 3 consent + deny-list (Compliance is useless without them).
- Phase 1 lite: agents **in the web process**, no new service.

### Out of scope

- Public multi-vendor agent marketplace.
- Signed cards / OIDC mesh (P2).
- Porting omnichat voice or their Claude orchestration wholesale.
- Replacing automations/flows — agents **call** them or sit beside them.

### Effort

**L** (P0 pair **M**; all five **L**)

### Risks

- Agents bypass gates via MCP writes. Mitigation: Compliance is in the **send service**, not only in the agent.
- Token cost / loops. Mitigation: max turns, per-conversation cap (exists for auto-reply).
- Spec churn. Mitigation: pin A2A 1.0 JSON-RPC subset (SendMessage, GetTask, CancelTask, GetAgentCard).

---

## Phase 5 — Theme / UX polish

**Goal:** Doral-looking marketing surfaces and a calmer operator UI. No new backends.

### Deliverables

- [ ] Brand tokens: logo, primary/secondary, fonts — landings + login + sidebar mark.
- [ ] Landing `/p/[slug]` mobile-first, accessible form, consent language readable.
- [ ] Inbox + campaign banners: “WhatsApp is not for clinical results.”
- [ ] Agents page: cards readable by Maya/Luis, not only Ashish.
- [ ] Empty states: no consent, no UTM, Compliance blocked send.
- [ ] i18n: `en` first; Spanish if Doral needs it (`messages/en.json` pattern).
- [ ] Light pass on settings IA so Email, WhatsApp, AI, API keys are findable.

### Dependencies

- Phase 3 landings exist. Phase 4 agents exist or polish playground + Compliance badges only.

### Out of scope

- New design system rewrite (keep shadcn / Tailwind v4).
- Marketing website repo (`wacrm-site`). Doral public pages live **in this app**.

### Effort

**M**

### Risks

- Polish before gates. **Do not start Phase 5 until P0-3–P0-5 exist.** Theme can proceed in parallel with Phase 4 UI only after consent ships.

---

## Sequence and parallelism

```
Phase 0 ──► Phase 1 ──► Phase 3 ──► Phase 4
                │                      ▲
                └──► Phase 2 ──────────┘ (REST/groups; not a hard gate for consent)
Phase 3 ──► Phase 5
```

- **Critical path to first Doral blast:** 0 → 1 → 3 (consent + landing + gated send).
- **Critical path to agents:** 3 → 4 (Qualifier + Compliance).
- Phase 2 can overlap Phase 3 if two workstreams exist; solo Ashish: 3 before 2 unless group admin is blocking.

---

## Cross-cutting out of scope (all phases)

- EHR, eRx, lab interfaces, insurance eligibility.
- Claiming HIPAA on WhatsApp.
- Merging `whatsapp-research` / `omnichat`.
- New Compose services (agent runtime, local Postgres, vector sidecar).
- Purchased SMS lists, scrape-based contact graphs.
- Implementing product features in the same commit as these docs.

---

## Risk register (delivery)

| Risk | Phase | Size | Handle |
| --- | --- | --- | --- |
| Meta rejects templates | 3 | M | Generic consult language; no clinical |
| Hosted Supabase + LLM = PII subprocessors | 1–4 | M | Counsel; DPA; no PHI in prompts |
| Group admin never stable on Baileys | 2 | L | Drop admin; Cloud API + REST only |
| A2A adapter yak-shave | 4 | M | Cards + three RPCs; skip SSE v1 |
| Operator burnout (L+L+L) | 3–4 | L | Ship P0 Compliance as functions first, agents second |

---

## Suggested first tickets (after docs merge)

1. Phase 0 `docs/BASELINE.md` + record SHA.
2. Phase 1 compose smoke on the Doral Supabase project.
3. Phase 3 migration: `consents` + deny-list + landing slug.
4. Wire deny-list + consent into broadcast send (even before agents).
5. Phase 4: Compliance agent card wrapping that same function.

---

*End of PLAN. Product rules live in PRD-doral-healthcare.md.*
