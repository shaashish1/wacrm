# PRD — AudienceGate

**Product:** AudienceGate (WhatsApp campaign CRM + digital marketing + in-app A2A)  
**First tenant:** tenant #1 — a US wellness clinic (demo name: Cedarline Wellness). Not the product name.  
**Operator:** Ashish (data scientist; builds and runs the stack)  
**Base repo:** `shaashish1/wacrm` — internal name; public brand is AudienceGate  
**Status:** Living product spec.  
**Date:** 2026-08-31 (tenant naming updated 2026-09-01)  
**Companions:** [PLAN.md](./PLAN.md) (user stories + challenges), [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## 1. Vision

One self-hosted app for the first wellness clinic: WhatsApp inbox and CRM, marketing campaigns with consent, and a small set of **in-app agents** that collaborate over the Linux Foundation **Agent2Agent (A2A)** protocol.

Operators work in one UI. Agents talk to each other as agents (tasks, cards, discovery) — not as a pile of one-off webhooks. WhatsApp stays a **marketing and logistics** channel. It is **not** a clinical record or a HIPAA-covered messaging system.

---

## 2. Problem

Tenant #1 needs to:

1. Capture wellness leads (web, ads, events, WhatsApp) into one contact record.
2. Follow up on WhatsApp and email without blasting people who opted out.
3. Qualify interest (service, location, preferred time) without collecting diagnoses or SSN.
4. Book or hand off consults without putting PHI on WhatsApp.
5. Measure which campaign, landing page, and UTM produced the lead.

Today those jobs are split across AudienceGate (inbox, broadcasts, automations, a single AI playground), ad hoc marketing tools, and ideas sitting in adjacent repos (`whatsapp-research`, `omnichat`, waapi-gateway notes). Merging those repos is **out of scope**. This product **extends the `wacrm` codebase**.

---

## 3. Users

| Role | Who | Job |
| --- | --- | --- |
| Owner | Clinic principal / Ashish as operator | Brand, numbers, API keys, compliance gates, go-live |
| Marketer | Clinic marketing staff (or Ashish wearing this hat) | Campaigns, landings, UTMs, calendar, audiences |
| Agent (human) | Front-desk / receptionist | Inbox, assignment, notes, booking handoff |
| Patient / lead | Prospect or existing wellness client | Opt-in, reply, STOP, book a consult — **not** receive clinical results on WhatsApp |

System actors (not humans): Lead Qualifier, Content, Broadcast Compliance, Booking/Receptionist, Analytics — see §8.

---

## 4. Goals and non-goals

### Goals

- Keep **all existing AudienceGate CRM value**: inbox, contacts, tags, custom fields, contact groups, pipelines, broadcasts, automations, flows, WA group **sync/import**, email drip campaigns, AI playground + knowledge base + auto-reply, MCP server, `/api/v1` keys.
- Add a **marketing module** on the same account: leads, campaign attribution, public landing + lead capture, UTM, content calendar, consent ledger.
- Add **in-app agents** with A2A (Agent Cards, task lifecycle, discovery). MCP stays for “tools + data.” A2A is for “agent ↔ agent.”
- Ship first on **lite deploy**: web + worker + Redis + **hosted Supabase**. No extra Postgres in Compose.
- Enforce **healthcare-safe** message and storage rules on every send and every agent artifact.

### Non-goals

- Not an EHR, practice-management system, or billing system.
- Not a HIPAA-covered WhatsApp channel. No BAA with Meta for WhatsApp. **No PHI on WhatsApp.**
- Do not merge `whatsapp-research`, `omnichat`, or a waapi-gateway. Reference patterns only (booking, consent UX).
- Not a multi-tenant SaaS marketplace. One tenant account in v1 (team roles already exist).
- Not Meta/Google **ads manager** in v1 (hooks + CAPI later — P2).
- Not full clinical voice/STT pipeline (omnichat has this; do not port it).
- Not replacing MCP with A2A. Both stay.

### 4.1 First-class operator stories (must ship as product)

These are requirements, not backlog trivia. Full acceptance criteria live in [PLAN §1](./PLAN.md). HIPAA rule is unchanged: WhatsApp is **not** a BAA channel (§6).

**US-1 — QR connect + extract all group contacts**  
As a user I can connect WhatsApp via QR and extract contacts from **all** groups into our DB: **phone number**, **profile name**, **emails if available**, **Group ID**.

- Pairing is Baileys (`wwebjs`); QR is polled from `sessions` (Socket.IO optional).
- Sync writes `wa_groups` / `wa_group_participants` and upserts `contacts` for resolved phones.
- Email is a first-class column (`contacts.email`) but WhatsApp **rarely** provides it — empty is valid.
- Group ID is `wa_groups.id` (and `jid`). Today lineage is also a `WA Group: {subject}` tag; a durable membership key is the remaining gap.
- LID-only members must not become fake phone contacts.

**US-2 — Select + broadcast with random delay (QR / Baileys)**  
As a user I can select contacts and send a broadcast with **random delay** (anti-bot / anti-block) when using the **QR scan (Baileys)** method.

- Delay is enforced in the worker (`RateGovernor`), not only in the UI.
- Consent + `opted_out` remain hard gates. Imported group members are **not** an audience.
- Jitter is a risk reduction, **not** a ToS or anti-ban warranty.
- Cloud API sends follow Meta rules; they do not inherit Baileys jitter.

**US-3 — Schedule post / broadcast delivery**  
As a user I can schedule a broadcast (and email drip) for a future `scheduled_at`.

- Status `scheduled` until cron (`/api/broadcasts/cron`, `CRON_SECRET`) fires.
- Consent is re-evaluated at fire time.
- Without a pinger, the row waits — that is a deploy requirement (US-9), not a silent bug.

**US-4 — Configure AI LLM keys for A2A (BYOK)**  
As a user I can configure per-account LLM keys for A2A work: **BYOK**, **encrypted at rest** with `ENCRYPTION_KEY` (AES-256-GCM), never returned to the client.

- Existing `ai_configs` + `/api/ai/config` is the store. A2A must reuse it (no second vault in v1).
- Admin+ writes; test-key before persist; rotation of `ENCRYPTION_KEY` requires re-entry (runbook).

**Also required (supporting):** Full REST + sync still planned (Phase 2). Lite deploy = web + worker + Redis + hosted Supabase. Existing code already covers parts of US-1–US-4 (group sync, RateGovernor, `scheduled_at`, AI settings); gaps are listed in PLAN §1 and ARCHITECTURE §8.

---

## 5. Personas

**Ashish — operator / data scientist**  
Wants one Compose stack, hosted Supabase, measurable funnels, agents he can inspect (cards, tasks, traces). Will run cron, keys, and model spend. Needs red-team rules so an agent cannot dump a chart review into WhatsApp.

**Maya — marketer**  
Runs a “New patient wellness week” campaign. Needs a landing page, UTM, WhatsApp opt-in checkbox, audience = contact group “miami-event-leads,” drip on email + WhatsApp template, content calendar for next 4 weeks. Will not write SQL.

**Luis — front desk**  
Lives in Inbox. Wants assignment, canned-safe replies, “book consult” without seeing SSN or diagnosis. Hands off when the lead asks about lab results.

**Priya — lead**  
Clicked an Instagram ad → landing → “Text me on WhatsApp.” Expects a welcome, a slot offer, and STOP to work. Must never be asked for SSN or “what’s your diagnosis?” on this channel.

---

## 6. WhatsApp is not HIPAA — product rules

**Fact:** Meta does not offer a BAA for consumer WhatsApp, WhatsApp Business, or the WhatsApp Business Platform. Encryption ≠ HIPAA. This product **must assume WhatsApp traffic is not a covered channel**.

Treat the app as a **marketing / scheduling CRM** for a wellness clinic, not as a system of record for treatment.

US-1 (group extract) and US-2 (Baileys broadcast) do **not** change this. A QR-paired number is still unofficial WhatsApp, still not under a Meta BAA, and extracting phones from groups is **not** consent to market.

### 6.1 Allowed on WhatsApp and in agent memory

- First name, phone (E.164), email, marketing consent timestamp + source.
- Service **interest** from a closed list (e.g. “wellness consult,” “nutrition intro,” “membership tour”) — not a diagnosis.
- Preferred location, language, time window.
- Campaign / UTM / landing id.
- Appointment **request** language: “consult,” “intro visit,” “tour” — not “follow-up for [condition].”
- Opt-out flag. Honor `STOP` / `UNSUBSCRIBE` (already in AudienceGate `opt-out.ts`; extend to `END`, `QUIT`, `CANCEL` if Meta requires).

### 6.2 Forbidden (block at input, template, KB, and A2A artifact)

- SSN, driver’s license, insurance member ID, medical record number.
- Diagnoses, medications, lab/imaging results, treatment plans, visit notes.
- Photos of wounds, IDs, prescriptions.
- “Tell us your symptoms” free-text that becomes stored clinical narrative. If the user volunteers it: **do not persist** in contact fields, KB, or agent artifacts; reply with a redirect to a **HIPAA-capable** channel or in-clinic intake; escalate to human.
- Using WhatsApp to confirm a **named clinical** appointment (“your MRI results are ready”). Use generic: “We have an opening Tue 10:00 for a consult. Reply YES or STOP.”

### 6.3 Consent and TCPA / Meta

- Marketing WhatsApp requires **prior express consent**. Store `consent_source`, `consent_at`, `consent_text` (verbatim checkbox copy), `ip`/`user_agent` on web forms.
- Landing forms: unchecked-by-default WhatsApp opt-in. Email can be separate.
- Every marketing template footer: “Reply STOP to opt out.”
- Broadcast Compliance agent **must refuse** send if any recipient lacks consent or is `opted_out`.
- 24-hour service window vs template rules stay as AudienceGate/Meta already enforce.

### 6.4 Data residency and subprocessors

- Hosted Supabase and LLM vendors are subprocessors. Document them. Do not send forbidden fields to the model. Redact in logs (phone last-4 only in worker logs over time — P1).
- Knowledge base: marketing FAQs, hours, addresses, service menu, parking — **no** clinical protocols that encode PHI examples.

---

## 7. Feature set

### 7.1 WhatsApp CRM — maximize existing AudienceGate

Ship tenant #1 on what already works. Do not rebuild.

| Already in AudienceGate | Clinic use | Gap to close later |
| --- | --- | --- |
| Shared inbox, assignment, notes | Front desk | PHI-safe note templates (P1) |
| Contacts, tags, custom fields, CSV | Lead records | Custom-field **deny list** for SSN/MRN (P0) |
| Contact groups + smart filters | Audiences | Consent-aware group resolve (P0) |
| Pipelines / deals | Lead stages: New → Qualified → Booked → Showed → Member | No PHI in deal titles |
| Automations + flows | Keyword → tag; welcome series | Block clinical keywords → escalate (P0) |
| WA groups: list, sync, import phones | Community / event groups; **US-1 extract** (phone, name, Group ID) | Email almost never from WA; LID-only rows; durable `source_group_id`; **group admin** (Phase 2) |
| Broadcasts + `scheduled_at` + cron | **US-2 / US-3** select, delay, schedule | Configurable jitter; cron heartbeat; consent re-check tests |
| RateGovernor (250/day, warming, 1–3s jitter) | Baileys anti-burst for **US-2** | Delay policy UI; better distribution; not a ban warranty |
| Email config + drip `/campaigns` | Nurture | Unsubscribe + consent parity with WhatsApp (P0) |
| AI playground, KB, auto-reply, `/api/ai/config` | **US-4** BYOK keys (GCM / `ENCRYPTION_KEY`) | A2A specialists consume the same keys (Phase 4) |
| MCP (`wacrm-mcp`) + `/api/v1` | Ashish / Cursor tools | Phase 2 REST shipped: wa-groups, consents, contact-groups, campaigns CRUD + enroll/pause/resume, pipelines/deals, landings. Still open: Baileys group-admin, webhook delivery queue |
| Roles: viewer < agent < admin < owner | Least privilege | Cannot disable consent; CSV export admin+ (confirm); agent capability flags (P1) |

**Lite deploy (constraint):** `docker-compose.yml` = web `:3100` + worker `:4000` + Redis. Postgres/Auth = **hosted Supabase**. Cron via GitHub Actions or host crontab hitting existing `/api/broadcasts/cron`, `/api/campaigns/cron`, `/api/automations/cron`, `/api/flows/cron`. Socket.IO optional.

### 7.2 Digital marketing (new module, same account)

Reuse contacts, tags, contact groups, campaigns, broadcasts. Add what marketing actually needs:

| Capability | P | Notes |
| --- | --- | --- |
| **Lead object** (or contact + `lead_source` / stage) | P0 | Deduped on phone/email. Source: form, WhatsApp inbound, CSV, import from WA group |
| **Consent ledger** | P0 | Channel (wa/email), source, timestamp, copy, revocation |
| **Public landing pages** | P0 | Clinic-branded page(s), form → contact + consent + UTM. Hosted on same Next.js app (`/p/[slug]`) |
| **UTM + attribution** | P0 | `utm_source/medium/campaign/content/term` stored on lead; first-touch + last-touch |
| **Campaigns (marketing)** | P0 | Tie existing drip + broadcasts to a marketing campaign id, landing, UTM pack |
| **Content calendar** | P1 | Planned posts/sends (WhatsApp template, email, later social). Not an ads publisher |
| **Ads hooks** | P2 | Meta CAPI / offline conversions from “Booked” / “Showed.” Do not build Ads Manager UI |
| **Email** | P0 if already configured | Use existing SMTP/campaigns. Add List-Unsubscribe + honor unsub |

Do **not** build a generic website CMS. One or few landings + form + thank-you is enough.

### 7.3 In-app AI agents + A2A

Today `/agents` is one BYOK bot (playground, setup, usage). Target: **named agents** with cards, skills, and tasks.

**A2A (from [a2aproject/A2A](https://github.com/a2aproject/A2A), spec v1.0, Linux Foundation / Google):**

- Agents are **opaque**. They do not share memory, prompts, or tools. They share **messages, tasks, artifacts**.
- **Agent Card** JSON at a well-known URL (`/.well-known/agent-card.json` or per-agent `/api/a2a/{agent}/agent-card.json`): name, description, url, `protocolVersion`, skills, capabilities (streaming, push), `securitySchemes`.
- **Task** is the unit of work: `submitted` → `working` → `input-required` | `completed` | `failed` | `canceled`. Long-running OK (broadcast review, content draft).
- **Operations:** SendMessage, StreamMessage (SSE), GetTask, ListTasks, CancelTask, GetAgentCard.
- **Bindings:** JSON-RPC 2.0 over HTTPS (default), plus HTTP/REST. Use JSON-RPC for the adapter; REST only if it maps 1:1.
- **Auth:** scoped API key or OIDC later. Internal mesh uses service auth, not the public internet.
- **Healthcare multi-agent** is an official A2A teaching example (flight/hotel analog → our qualifier/compliance/booking). Same pattern: orchestrator delegates; specialists stay narrow.

**How it applies here**

| Client agent | Server agent | Typical task |
| --- | --- | --- |
| Inbox auto-reply / orchestrator | Lead Qualifier | “Classify this inbound; return service + consent_ok + escalate?” |
| Marketer UI / Content | Broadcast Compliance | “May I send campaign X to group Y? Return allow + drop list.” |
| Lead Qualifier | Booking/Receptionist | “Offer 3 consult slots; no clinical reason codes.” |
| Any | Analytics | “Summarize funnel for campaign Z this week.” |
| Content | Compliance | “Review draft for PHI + STOP footer + template policy.” |

External future: a third-party booking agent publishes its card; the AudienceGate Booking agent discovers it. v1 is **in-process / same-origin** cards so we do not depend on a public agent registry.

### 7.4 A2A vs MCP (keep both)

| | MCP (exists: `mcp-server/`, `docs/mcp.md`) | A2A (new adapter) |
| --- | --- | --- |
| Relationship | **Agent → tools/data** | **Agent → agent** |
| AudienceGate today | `list_contacts`, `send_message`, … wrapping `/api/v1` | None |
| State | Stateless tool calls | Stateful **tasks** (hours-long review OK) |
| Opacity | Tool schema is the contract | Card + skills; internals hidden |
| Writes | Opt-in `WACRM_ENABLE_WRITES` / broadcasts | Per-skill; Compliance agent is a gate, not a tool wrapper |
| Who uses it | Cursor, Claude Desktop, Ashish | In-app agents; later external agents |

**Rule:** Agents call **MCP/tools** (or internal TS services) to read/write CRM. Agents call **A2A** to ask another agent to *reason and decide*. Do not wrap Lead Qualifier as a single MCP tool — that throws away negotiation (`input-required`, artifacts).

---

## 8. A2A agent roster and talk paths

All five are **in-app**. Each publishes a card. Orchestrator (inbox bot or Concierge) is a thin router, not a sixth personality dump.

```
  Lead (WhatsApp/web)
        │
        ▼
  Concierge / auto-reply (existing AudienceGate bot, constrained)
        │  A2A SendMessage
        ├──────────────► Lead Qualifier
        │                     │
        │                     ├─► Booking/Receptionist  (slots)
        │                     └─► Analytics             (source quality)
        │
  Marketer UI
        ├──────────────► Content
        │                     └─► Broadcast Compliance
        └──────────────► Broadcast Compliance  (pre-flight audience)
```

### 8.1 Lead Qualifier — P0

- **Skills:** `qualify_inbound`, `score_lead`, `detect_phi_leak`.
- **In:** redacted message text, existing tags, consent flags, UTM if any.
- **Out artifact:** `{ service_interest, locale, urgency, score, escalate: boolean, reason_code }` — **no** symptom dump.
- **Talks to:** Booking (if score ≥ threshold and consent_ok); Analytics (source); human inbox if escalate.
- **Refuse:** persist or relay SSN/diagnosis/meds.

### 8.2 Content — P1

- **Skills:** `draft_whatsapp_template`, `draft_email`, `draft_landing_hero`, `calendar_item`.
- **In:** campaign brief, brand voice, **forbidden-topic list**.
- **Out:** draft + suggested footer. Never auto-send.
- **Talks to:** Broadcast Compliance (required before any send path).

### 8.3 Broadcast Compliance — P0

- **Skills:** `preflight_audience`, `review_copy`, `enforce_opt_out`.
- **In:** campaign id, group ids, copy, template name.
- **Out:** `{ allow, blocked_contact_ids[], violations[] }` (missing consent, opted_out, PHI regex, missing STOP, template mismatch).
- **Authority:** hard block. Orchestrator and `/api/v1/broadcasts` (when wired) must call this or an equivalent server function. Not advisory-only.

### 8.4 Booking / Receptionist — P1

- **Skills:** `offer_slots`, `confirm_consult`, `cancel_consult`, `handoff_human`.
- **Pattern:** borrow **ideas** from omnichat/whatsapp-research (Google Calendar freeBusy, confirm “1/2/3”) — **reimplement** against AudienceGate contacts + a thin `appointments` table. Do not merge that repo.
- **Copy rules:** “consult / intro / tour” only. No reason-for-visit field on WhatsApp.
- **Talks to:** Lead Qualifier (context); human on conflict or “results / medication” intent.

### 8.5 Analytics — P1

- **Skills:** `campaign_funnel`, `agent_task_stats`, `opt_out_rate`.
- **In:** campaign id, date range. **Out:** aggregates only (no message bodies in artifacts).
- **Talks to:** Marketer UI; optional weekly artifact to Content (“what landed”).

### 8.6 Discovery and security

- Internal registry table `a2a_agent_cards` + HTTP GET of cards (same origin).
- Skills list is the allow-list. Unknown skill → A2A error, not silent MCP fallback.
- Task store in Postgres (hosted Supabase). Artifacts scanned by the same PHI deny-list as inbound.
- Streaming optional in v1; poll `GetTask` is enough for lite deploy.

---

## 9. Requirements

### P0 — must have for tenant #1 marketing go-live

| ID | Requirement |
| --- | --- |
| P0-1 | Lite stack documented and runnable: web, worker, Redis, hosted Supabase, health checks, cron secrets. |
| P0-2 | Existing CRM paths work: inbox, contacts, groups, broadcasts, automations, email campaigns. |
| P0-3 | Custom-field / contact / notes / KB **deny-list** (SSN, MRN, insurance ID, clinical terms config). |
| P0-4 | Consent ledger + landing form with explicit WhatsApp opt-in; UTM capture. |
| P0-5 | Broadcast + campaign send **blocked** for opted-out / no-consent; STOP already honored — keep and extend. Existing imported book (~4,907) has **no** backfilled consent. |
| P0-6 | Lead Qualifier + Broadcast Compliance as in-app agents with Agent Cards + task log (even if first impl is same-process JSON-RPC). |
| P0-7 | PHI volunteer path: do not store; escalate; canned “please call the office / use the patient portal.” |
| P0-8 | Role gates: marketers send campaigns; agents cannot export full CSV without admin (confirm current behavior). |
| P0-9 | **US-1:** QR pair a Baileys number; extract all group participants to DB (phone, profile name, email if available, Group ID). LID-only stays non-contact. Re-sync idempotent. |
| P0-10 | **US-2:** Select contacts and send Baileys broadcast through `RateGovernor` random delay + daily/warming caps. Server consent gate. UI must not claim ban-proof. |
| P0-11 | **US-3:** Schedule broadcast via `scheduled_at`; cron with `CRON_SECRET` required in production; re-check consent at fire; cancel before send. |
| P0-12 | **US-4:** Per-account BYOK LLM keys in `ai_configs`, AES-256-GCM with `ENCRYPTION_KEY`, never returned to client; A2A reuses this store. |

### P1 — next

| ID | Requirement |
| --- | --- |
| P1-1 | **Full REST remainder**: Baileys group-admin + webhook delivery queue. Campaigns (incl. create/update/resume), pipelines/deals, and landings shipped. |
| P1-2 | WA **group admin** + durable contact↔Group ID lineage (not only tags) + reliable sync on Baileys. |
| P1-3 | Content + Booking + Analytics agents on A2A (consume US-4 keys). |
| P1-4 | Content calendar UI. |
| P1-5 | Booking table + Google Calendar OAuth (optional) — generic consults only. |
| P1-6 | A2A adapter documented next to MCP; JS SDK `@a2a-js/sdk` or thin in-house JSON-RPC. |
| P1-7 | Log redaction; task/audit trail for agent decisions, consent, key rotate, QR pair, broadcast send. |
| P1-8 | Clinic theme (colors, logo, landing) — can slip to Phase 5 if brand pack late. |
| P1-9 | Operator-configurable Baileys delay window + non-uniform jitter; cron heartbeat / SLA alert. |
| P1-10 | Observability: structured logs, queue depth, session state; backup/restore runbook (session volume + Supabase PITR). |

### P2 — later

| ID | Requirement |
| --- | --- |
| P2-1 | Meta Conversions API / ads hooks. |
| P2-2 | External A2A discovery (other orgs’ cards). |
| P2-3 | Signed Agent Cards, OIDC between agents. |
| P2-4 | Multi-landing CMS, A/B tests. |
| P2-5 | Voice notes → text (do not ingest clinical audio). |

---

## 10. Success metrics

| Metric | Target (first 90 days after P0) |
| --- | --- |
| Time-to-first-response (human or bot) on new WhatsApp lead | < 5 min during staffed hours; < 15 min off-hours bot |
| % marketing sends blocked correctly (no-consent / STOP) | 100% of sampled audits |
| PHI deny-list hits that were **not** persisted | 100% (spot-check task artifacts + contact fields) |
| Lead → Booked consult (generic) | Track; baseline then +20% vs pre-attribution chaos |
| UTM coverage on new web leads | ≥ 90% |
| Agent task success (completed vs failed) | Logged; Qualifier + Compliance used on ≥ 80% of inbound marketing threads |
| Opt-out processing | STOP applied before next send (already an AudienceGate invariant — keep tests) |
| Lite deploy recovery | `docker compose up` + hosted Supabase; `/api/health` + worker `/health` green |

Vanity follower counts are not success. **Consent integrity and no-PHI-on-WhatsApp** outrank volume.

---

## 11. Risks

| Risk | Mitigation |
| --- | --- |
| Staff or agent puts PHI on WhatsApp | Deny-list + Compliance agent + training copy in UI; escalate path |
| Meta/TCPA complaint | Consent ledger + STOP + template footers; no purchased lists |
| **~4,907 imported contacts have no consent** | Keep server gate; preview eligible vs not; re-permission off WhatsApp; never backfill |
| Baileys ban / unofficial API | Prefer Cloud API for production marketing; Baileys for group extract + community number; RateGovernor; no “anti-ban guaranteed” |
| LID-only participants / missing emails | Show “no phone”; do not invent E.164; email from landings/CSV; US-1 still succeeds with empty email |
| Group size / sync load | Chunk writes; cap import-all; durable Group ID (Phase 2) |
| Jitter too uniform / cron down | Configurable delay (P1-9); heartbeat; documented “waiting on scheduler” |
| Redis / single-worker loss | Compose volume; single-worker invariant; replay pending recipients |
| `ENCRYPTION_KEY` rotate/loss | Runbook; re-enter WA + LLM keys; no silent empty decrypt |
| A2A over-engineering / not built | v1 same-origin JSON-RPC + cards; Compliance function first; no public registry |
| A2A loops / key exfil | Max turns; per-task budget; keys never in logs or artifacts |
| LLM exfil via KB or prompt | No clinical docs in KB; system prompt forbids PHI fields; artifact scan |
| Hosted Supabase as BA | Legal: marketing CRM DPA/BAA with Supabase if they process PII; still **not** a WhatsApp HIPAA fix |
| Dual-write MCP vs A2A | Writes only through existing services; agents never bypass Compliance for broadcasts |
| Multi-tenant leak vs one tenant account | Keep RLS; API keys account-scoped; no public SaaS in v1 |
| Lite-deploy SLA | Health checks + operator RTO/RPO; do not claim multi-AZ HA |
| Scope creep from omnichat (voice, Stripe, SDI) | Explicit non-merge; booking pattern only |

Full register (legal, LID, Redis, SLA, runbooks): [PLAN §3](./PLAN.md).

---

## 12. Compliance summary (operator checklist)

- [ ] WhatsApp used for **marketing and generic scheduling only**
- [ ] No BAA claimed for WhatsApp; patient portal / phone for clinical
- [ ] Consent recorded before first marketing WA
- [ ] STOP / unsubscribe works on WA and email
- [ ] Deny-list on contacts, notes, templates, KB, A2A artifacts
- [ ] LLM keys BYOK; no training on tenant chats with vendors if contract forbids
- [ ] Privacy policy + terms updated for the clinic + AI + subprocessors
- [ ] Staff role: agents cannot disable Compliance
- [ ] This PRD is **not** legal advice — clinic counsel reviews before go-live

---

## 13. Lite deploy constraint

**Allowed production shape for all phases until explicitly changed:**

- `apps/web` Next.js `:3100`
- `apps/worker` Baileys/BullMQ `:4000`
- Redis 7
- Hosted Supabase (migrations `001`–current via `db push`)
- Env from `.env` / hPanel; `SUPABASE_SERVICE_ROLE_KEY` server-only
- Cron secrets: `CRON_SECRET`, `AUTOMATION_CRON_SECRET`

**Not in v1 Compose:** local Postgres, Vector analytics, Edge Functions, extra agent runtimes, Kubernetes.

A2A servers run **inside the web app** (Route Handlers). No new container unless Phase 4 proves CPU isolation is required.

---

## 14. Adjacent repos (reference only)

| Repo | Steal | Do not |
| --- | --- | --- |
| `D:/Projects/whatsapp-research` | Receptionist flows, GDPR-ish consent language (adapt to US) | Merge app, Stripe, Italian SDI |
| `D:/Projects/omnichat` | Booking calendar / freeBusy / confirm-by-number UX | Voice, their Next app, their schema |
| waapi-gateway ideas | Thin gateway thinking for provider isolation | New standalone gateway service |

---

## 15. Open questions for Ashish

1. Cloud API number vs Baileys for production? **Recommendation:** Cloud API for lead-facing marketing sends; Baileys for US-1 group extract and any community QR number (US-2 delay applies there).
2. Google Calendar in P1 or paper/phone booking until then?
3. Counsel sign-off date before first marketing blast — especially the ~4,907 imported contacts (no consent).
4. Brand tokens (hex, logo) for Phase 5.
5. Operator SLA numbers (uptime, RTO/RPO) for the lite stack.
6. Confirm CSV export is admin-only on current `main` (P0-8).

---

*End of PRD. Implementation sequence is in PLAN.md.*
