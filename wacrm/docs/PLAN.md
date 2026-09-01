# PLAN — AudienceGate (tenant #1: first wellness clinic)

**Product:** AudienceGate (public brand). Repo stays `wacrm`.  
**Implements:** [PRD.md](./PRD.md)  
**Architecture:** [ARCHITECTURE.md](./ARCHITECTURE.md)  
**Repo:** `shaashish1/wacrm` — this product only  
**Operator:** Ashish  
**Date:** 2026-08-31  
**Constraint:** Lite deploy only (web + worker + Redis + hosted Supabase). This file does not implement product code.

Effort: **S** ≤ ~3 days, **M** ~1–2 weeks, **L** ~3–6 weeks (one operator, part-time).

User stories are **first-class** below (§1). Phases (§2) exist to sequence them. Challenges (§3) are the delivery risk register — legal, technical, operational, and scale.

---

## Principles

1. **Freeze then extend.** Do not fork a second WhatsApp stack. Adjacent repos are references.
2. **Compliance before volume.** Consent + STOP + PHI deny-list before Content agent or ads. Group extract ≠ permission to market.
3. **MCP stays.** A2A is an adapter beside it, not a replacement (`docs/mcp.md` vs new `docs/a2a.md` in Phase 4).
4. **Same-origin A2A in v1.** Cards + JSON-RPC on the Next.js app. No public agent registry.
5. **Cloud API for lead-facing marketing sends** unless Ashish explicitly needs Baileys group admin / QR community number in production. Baileys delay + schedule stories apply to the QR path.
6. **Enterprise posture.** Observability, audit, RBAC, secrets, backup, runbooks, and an operator SLA — not a hobby bot.

---

## 1. User stories (product backlog)

Every story has acceptance criteria, **already built vs gap**, and a phase. IDs are stable for tickets.

### US-1 — Connect WhatsApp via QR and extract group contacts

**As a** AudienceGate operator (Ashish) or marketer (Maya)  
**I can** connect a WhatsApp number by scanning a QR code and extract contacts from **all** groups the number participates in  
**so that** the CRM holds phone, profile name, email if available, and **Group ID** for later select / broadcast / schedule.

**Acceptance criteria**

1. Settings shows a live QR for the account’s Baileys (`wwebjs`) session; pairing completes without a browser Socket.IO connection (poll `sessions`).
2. After `connection open`, the worker syncs every participating group (`groupFetchAllParticipating`).
3. For each participant the DB stores: `wa_groups.id` (Group ID), `wa_groups.jid`, participant `jid`, **phone** when resolvable, **display_name** when known, admin flags.
4. Participants with a resolved phone are upserted into `contacts` (account-scoped, de-duped on normalized phone). Existing name/tags are not clobbered.
5. Each imported contact is attributable to source group(s): today via tag `WA Group: {subject}`; target also a durable `group_id` / membership row so subject renames do not lose lineage.
6. Email is stored on `contacts.email` **when available**. The UI states that WhatsApp almost never provides email; empty is success, not a sync failure.
7. LID-only members (no phone) remain visible on `/wa-groups` as “no phone” and are **not** silently invented as contacts.
8. Re-sync is idempotent. Operator can trigger sync from `/wa-groups`.
9. Audit: who paired, when sync ran, group count, phones resolved vs LID-only (structured log + dashboard counts already on `/wa-groups`).
10. RBAC: agent+ can import; admin+ pairs the number and edits WhatsApp settings.

**Already built:** QR pair, session poll, `syncGroups`, participant rows, auto contact upsert, group tags, `/wa-groups` UI, import selected / import-all.  
**Gaps:** no first-class `source_group_id` on `contacts`; email never comes from WA; LID→phone depends on app-state timing; no append-only pair/sync audit table.

**Phase:** 0–1 (operate what exists) + 2 (lineage column + REST trigger).

---

### US-2 — Select contacts and send a delayed broadcast (QR / Baileys)

**As a** marketer  
**I can** select contacts and send a broadcast with **random delay** (anti-bot / anti-block) when the number is connected by **QR scan (Baileys)**  
**so that** fan-out does not look like a scripted burst and the daily/warming caps are enforced.

**Acceptance criteria**

1. Operator selects an audience (contacts, tags, contact groups, or WA-group tag) and preview count.
2. Server drops `opted_out` and anyone **without** an active WhatsApp consent row. Empty eligible set → refuse with a clear error (existing `NO_CONSENT_MESSAGE`).
3. Copy is PHI-scanned (deny-list). Marketing footer includes STOP. WhatsApp is labeled not-for-clinical-results.
4. On Baileys: each outbound send goes through `RateGovernor`: 250/day cap; 15–60s jitter in 7-day warming; 15–20s first send after connect; broadcast jitter (today 1–3s).
5. Target: operator-visible delay policy (min/max, distribution) and a **non-uniform** jitter (e.g. jitter + small per-recipient extra, pause every N sends) documented as still **not** a ToS-safe guarantee.
6. Failures are per-recipient (`broadcast_recipients`); one 403 does not mark the whole blast sent.
7. Cloud API path does **not** pretend Baileys jitter applies; Meta rate limits / template rules apply instead.
8. RBAC: agent+ can send; viewer cannot. Compliance gate cannot be disabled by agents.

**Already built:** audience UI, consent gate, BullMQ drain, `RateGovernor` + tests, per-recipient rows.  
**Gaps:** jitter not configurable; 1–3s after warming is still bursty; no Compliance A2A agent (function exists); no explicit “Baileys delay policy” settings screen.

**Phase:** 1 (use as-is) + 3 (deny-list on copy) + hardening ticket for jitter quality.

---

### US-3 — Schedule post / broadcast delivery

**As a** marketer  
**I can** schedule a post or broadcast for a future time  
**so that** wellness-week drops go out in clinic hours without someone clicking Send at 06:00.

**Acceptance criteria**

1. Broadcast create accepts `scheduled_at` (ISO) in the account/operator timezone, status `scheduled`.
2. Nothing is sent until `scheduled_at <= now`.
3. An external pinger **must** hit `GET/POST /api/broadcasts/cron` with `CRON_SECRET` (GitHub Actions every 5 minutes **or** host crontab). Same for campaigns.
4. Recurrence (if set) computes the next `scheduled_at` after a run.
5. Operator can cancel a scheduled broadcast before fire.
6. Consent is re-checked at fire time (not only at create) so a STOP between schedule and send is honored.
7. If cron is down, UI shows scheduled items as **waiting on scheduler** (not “failed”). Runbook: how to fire the route by hand.
8. Enterprise: cron heartbeat metric; alert if no successful cron in 15 minutes while rows are `scheduled`.

**Already built:** `scheduled_at` on insert, `/api/broadcasts/cron`, GitHub `scheduled-jobs.yml`, “Send now” vs schedule documented in production.md.  
**Gaps:** no in-process scheduler; timezone UX may be browser-local; consent re-check at fire should be verified in tests; no heartbeat/alert; delayed **social** “posts” are out of scope (WhatsApp/email only).

**Phase:** 1 (wire cron on the production host) + test/hardening.

---

### US-4 — Configure AI LLM keys for A2A work (BYOK)

**As an** owner / admin  
**I can** configure AI LLM keys per account, encrypted at rest with `ENCRYPTION_KEY`  
**so that** playground and future A2A specialists call my vendor (BYOK) and keys never appear in the browser or in git.

**Acceptance criteria**

1. Settings → AI: choose `openai` | `anthropic`, model, optional system prompt, embeddings key.
2. “Test key” validates with the vendor before persist.
3. Persist is AES-256-GCM via `ENCRYPTION_KEY` (64 hex chars) into `ai_configs` **per account**.
4. GET never returns plaintext; only `has_key` / `has_embeddings_key`.
5. Admin+ only to write; any member may see whether AI is configured.
6. A2A (when built) **reuses** this row — no second secrets table in v1.
7. Rotate `ENCRYPTION_KEY` runbook: all WhatsApp tokens + LLM keys must be re-entered; mismatch is logged, not silent empty.
8. Keys are never written to application logs, A2A artifacts, or MCP responses.
9. Disable / clear key is an audited admin action.

**Already built:** `/api/ai/config`, test route, GCM encrypt, per-account row, playground + auto-reply consume the key.  
**Gaps:** A2A not built (keys unused by specialists); no dedicated key-rotation audit event; embeddings decrypt mismatch is logged (good) but operator UI could be louder.

**Phase:** 1 (use as-is) + 4 (A2A consumes same config).

---

### Supporting stories (same product)

| ID | Story | Phase | Status |
| --- | --- | --- | --- |
| US-5 | As counsel / owner, I can prove WhatsApp is **not** a HIPAA channel and block PHI on send, notes, KB, and agent artifacts. | 3–4 | Partial (deny-list on A2A, notes, KB, templates, deal notes; account-JSON extras + inbox banners still open) |
| US-6 | As a marketer, I can capture **prior express consent** on a landing (verbatim copy, IP, UA) before any marketing WA. | 3 | Built |
| US-7 | As a lead, I can reply STOP and never get another marketing WA/email from this system. | 3 | Built (WA); email List-Unsubscribe still open |
| US-8 | As an integrator, I can use **full REST + sync**: contact-groups, campaigns, wa-groups read/sync, consents, pipelines, landings. | 2 | Partial (`/api/v1` has wa-groups, consents, contact-groups, campaigns CRUD + enroll/pause/resume, pipelines/deals, landings, webhook queue; Baileys group-admin still open) |
| US-9 | As an operator, I can run **lite deploy** (web `:3100` + worker `:4000` + Redis + hosted Supabase) with health checks. | 1 | Docs + compose exist; production smoke still an operator task |
| US-10 | As the concierge, I can delegate to Lead Qualifier, Compliance, Content, Booking, Analytics over A2A. | 4 | **Not built** |
| US-11 | As Maya, I can run group-extract → select consented subset → delayed Baileys send → schedule (end-to-end example in ARCHITECTURE §6.2). | 1–3 | Partial (pieces exist; consent vs ~4,907 imports is the blocker) |
| US-12 | As owner, I can invite staff with RBAC (viewer/agent/admin/owner) and they cannot cross accounts (RLS). | — | Built |
| US-13 | As ops, I can restore from backup and re-pair WhatsApp using a written runbook. | 1 | Docs partial; session-volume + PITR procedure not signed off |

---

## 2. Phases

### Phase 0 — Freeze AudienceGate (`wacrm` repo) as base

**Goal:** One chosen codebase. Everyone builds on current `main`.

**Stories:** inventory for US-1–US-4 against live `main`.

**Deliverables**

- [x] PLAN + PRD in `docs/`.
- [x] `docs/BASELINE.md` + architecture pointer.
- [ ] Inventory sign-off: inbox, contacts, contact-groups, wa-groups sync/import, broadcasts, campaigns/email, automations, flows, pipelines, agents playground, MCP, `/api/v1`.
- [ ] Decision log: Cloud API vs Baileys for **lead-facing** marketing sends (recommendation: Cloud API). QR/Baileys retained for group extract + community number (US-1, US-2).

**Out of scope:** feature work, merging other repos.  
**Effort:** S  
**Risk:** drift to omnichat. Mitigation: all product tickets target `wacrm` only.

---

### Phase 1 — Lite compose + hosted Supabase

**Goal:** Same shape as [LITE-DEPLOY.md](./LITE-DEPLOY.md). Enables US-9, cron for US-3, keys for US-4, QR smoke for US-1.

**Deliverables**

- [x] `.env` from `.env.example`; no secrets in git.
- [ ] `docker compose up -d --build` → web `:3100` `/api/health`, worker `:4000` `/health`, Redis healthy.
- [ ] Hosted Supabase: migrations **001–current** in order (GRANT 031, 051–053, **057** consents/landings). No `db reset` on the real project.
- [ ] Cron live: GitHub `scheduled-jobs.yml` **or** crontab (`CRON_SECRET` / `AUTOMATION_CRON_SECRET`).
- [ ] Pair **one** test number. Inbox send/receive smoke. Do **not** blast the imported book.
- [x] Windows notes documented.

**Out of scope:** new marketing tables, A2A, REST expansion, visual redesign.  
**Effort:** S–M  
**Risks:** session volume / QR vs Cloud webhook URL; cron unset → scheduled sits; `SUPABASE_SERVICE_ROLE_KEY` in client bundle — verify build.

---

### Phase 2 — Full REST + group admin + sync

**Goal:** US-8. Anything marketers and agents automate is on `/api/v1`. WA groups operable, not just listed.

**REST (same auth: hashed API keys, scopes, envelope, 120 rpm)**

- [x] `contact-groups` CRUD + members.
- [x] `campaigns` create/update/read/enroll/pause/resume (`campaigns:read`, `campaigns:send`). Create is always draft; resume returns enrollments to cron and does not send.
- [x] `pipelines` / `deals` read+write (minimal).
- [x] `landings` list/get/create/update (`landings:read`, `landings:write`). Tables from migration 057; no new GRANT.
- [x] `wa-groups` read + trigger sync; admin actions behind `groups:admin` (sync only; add/remove/promote still open).
- [x] `consents` read.
- [x] Update `docs/public-api.md`. MCP tools may wrap new read endpoints (writes still opt-in).
- [x] Webhook delivery queue (durable retry-with-backoff). Endpoint CRUD already ships; `webhook_deliveries` + claim RPC (063), drain in web `after()` / `/api/webhooks/cron` / worker.

**Group admin + sync (Baileys; Cloud API groups are limited)**

- [x] Partial sync: subject, size, participants, announce/restrict (worker upsert).
- [ ] Durable contact ↔ Group ID lineage (beyond tags).
- [ ] Admin actions if paired number is admin: add/remove, promote/demote, subject — **not** in worker today.
- [ ] UI on `/wa-groups` + error if not admin.
- [ ] Import remains **without** marketing consent (US-5 / US-6).

If production sends are Cloud-API-only, **group admin is deferred** and this phase is REST-only (shrink to **M**). QR extract (US-1) still needs a Baileys session even if marketing sends use Cloud API.

**Effort:** L (admin + REST) / M (REST only).

---

### Phase 3 — Marketing module (leads, campaigns, consent)

**Goal:** Legal to send. Closes US-5–US-7 and the consent hole on ~4,907 existing imports (US-11).

**Schema / product (much already landed)**

- [x] `consents`, UTM on contacts, `landing_pages`, public `/p/[slug]`, audience ∩ consent, broadcast refuse without consent, STOP revokes WA consent.
- [ ] `marketing_campaigns` wrapper **or** FK from existing campaigns/broadcasts.
- [x] PHI deny-list on notes (contact notes API + deal notes), KB, templates, and A2A artifacts. Account-specific extra JSON terms still open.
- [ ] Email List-Unsubscribe + parity with WA.
- [ ] Consent badge on contact; STOP footer defaults; checkbox copy stored verbatim (landing already stores copy).
- [ ] Content calendar (**P1**).
- [ ] **Re-permission program** for the existing imported book: do **not** backfill consent. Count eligible vs ineligible on the broadcast preview. Optional one-time email/SMS/in-clinic ask (not WhatsApp cold blast).

**Effort:** L  
**Critical path to first marketing blast:** 0 → 1 → 3.

---

### Phase 4 — In-app agents + A2A adapter

**Goal:** US-10. Five specialists. MCP still drives CRM tools. Keys from US-4.

| Layer | What to build |
| --- | --- |
| Tools | Keep `mcp-server` → `/api/v1`. Add scopes as Phase 2/3 APIs land. |
| Agents | `apps/web/src/lib/a2a/`: cards, JSON-RPC, task store. |
| SDK | Prefer `@a2a-js/sdk` if small; else ~200 LOC JSON-RPC. Spec: https://a2a-protocol.org/latest/specification/ |
| Cards | `GET /api/a2a/:agentId/agent-card.json` |
| Tasks | `a2a_tasks` (state, context_id, artifacts JSON, created_by). Scan artifacts with deny-list. |
| Auth | API keys `a2a:invoke` external; session cookie in-app. |
| Keys | Decrypt `ai_configs` only in-process. Per-task token budget. |

**P0 agents:** Lead Qualifier, Broadcast Compliance (hard gate on send path).  
**P1:** Content, Booking/Receptionist, Analytics.  
**Do not** expose raw send/broadcast MCP to Concierge without Compliance success.

**Effort:** L (P0 pair **M**).

---

### Phase 5 — Theme / UX polish

**Goal:** Clinic-branded landings and a calmer operator UI. No new backends.  
**Do not start** until P0 consent gates exist (Phase 3).  
**Effort:** M

---

### Sequence

```
Phase 0 ──► Phase 1 ──► Phase 3 ──► Phase 4
                │                      ▲
                └──► Phase 2 ──────────┘
Phase 3 ──► Phase 5

US-1 QR+extract ──► US-11 e2e (needs US-6 consent)
US-2 delay send ──► same
US-3 schedule    ──► Phase 1 cron
US-4 LLM keys    ──► Phase 4 A2A
US-8 full REST   ──► Phase 2 (not a hard gate for consent)
```

Solo Ashish: Phase 3 before Phase 2 unless group admin is blocking. Two workstreams may overlap 2 and 3.

---

## 3. Challenges and mitigations

Find these **now**. Do not discover them on the first blast. This is not legal advice; clinic counsel signs off before go-live.

### 3.1 Legal / policy

| Challenge | Why it matters | Mitigation |
| --- | --- | --- |
| **WhatsApp ToS + unofficial API (Baileys)** | QR/Web protocol is unsupported. Ban, session drop, or ToS action can zero the channel. | Prefer **Cloud API** for patient-facing marketing. Treat Baileys as **group extract + community number**. RateGovernor + warming. No scraping, no purchased lists. Accept residual ban risk in writing. |
| **Ban is not “fixed” by jitter** | Random delay reduces bot-shaped bursts; it does **not** make unofficial use compliant. | Document this on the broadcast UI. Never market “anti-ban guaranteed.” |
| **No BAA for WhatsApp** | Meta does not offer a BAA for consumer WA, WA Business, or the Business Platform. Encryption ≠ HIPAA. | Product rule: marketing + generic scheduling only. No PHI. See PRD §6. UI banners. Escalate clinical to phone/portal. |
| **HIPAA misunderstanding** | Staff think consent or encryption makes WA HIPAA. | Training + persistent banner. Counsel review. Do not claim HIPAA on this inbox. |
| **TCPA / Florida telemarketing** | Tenant #1 is a US wellness clinic. Marketing WA needs **prior express consent**. Group membership is not consent. | Consent ledger + verbatim copy + IP/UA. STOP. No blast of imported group members. |
| **~4,907 existing contacts** | Auto-upsert / import created CRM rows **without** `consents`. A send to “all contacts” would be empty (gate) or illegal if the gate were bypassed. | Keep the server gate. Preview: eligible vs ineligible. Re-permission off WA (email, in-clinic, landing). **Never backfill** consent. |
| **Purchased / scraped lists** | Out of policy and high complaint risk. | Non-goal. Reject CSV without source attestation (P1). |
| **Hosted Supabase + LLM = PII subprocessors** | Names, phones, emails leave the clinic boundary. | DPAs; no PHI in prompts; redact logs; document subprocessors in privacy policy. |
| **Record retention / deletion** | Leads can request delete; STOP is not erasure. | P1: export/delete contact + messages + consent rows; account-scoped. |
| **International numbers in groups** | Different consent regimes if a group is mixed. | Treat as US marketing CRM; do not add non-US numbers to marketing audiences without counsel. |

### 3.2 WhatsApp / data quality

| Challenge | Why it matters | Mitigation |
| --- | --- | --- |
| **LID vs phone** | Many participants are `@lid`. Phone appears only after app-state / `lidToPhone`. Broadcasts need E.164. | Delay first group sync (`GROUP_SYNC_DELAY_MS`). Show LID-only separately. Do not fabricate numbers. Re-sync after address book events. |
| **Missing emails** | `contacts.email` is empty for WA-origin rows. Email campaigns and identity join fail. | Capture email on landings/CSV. Do not block group sync on missing email. Optional later: ask in a consented WA thread (“reply with email”) — still no PHI. |
| **Missing / generic names** | `notify` often absent; UI shows phone only. | Leave `null`; do not invent. Allow manual edit; do not overwrite on re-sync. |
| **Group size / communities** | Large groups (hundreds–thousands) + community announce channels. Sync chunks (200) still hammer WA and Postgres. | Chunk writes (exists). Back off sync interval. Cap “import all.” Prefer tag-filter audiences. Community announce: extract still OK; **do not** spam the community. |
| **Subject rename** | Tag `WA Group: {old}` drifts from Group ID. | Phase 2: membership table keyed by `wa_groups.id` / jid. |
| **Membership churn** | People leave; CRM still has the phone. | Re-sync updates participants; do **not** auto-delete contacts. Marketing still requires consent. |
| **Multi-group same phone** | One person in 8 groups. | De-dupe on `phone_normalized`. Multi-tag. |
| **Device / QR limits** | WA Web sessions drop; one phone, limited linked devices; QR expires. | Runbook: re-pair. Persist session volume. Alert on `sessions` disconnected. Do not run two workers on one session. |
| **Cloud API vs Baileys split-brain** | Templates/interactive only on Cloud API; groups only useful on Baileys. | One `accounts.provider_type`. Document which number is which. Do not dual-send the same audience. |
| **Meta template rejection** | Clinical or promotional language blocked. | Generic consult copy; no condition names. |
| **24-hour service window** | Cloud API session messages vs templates. | Existing AudienceGate/Meta rules; scheduled marketing = templates on Cloud API. |
| **Rate limits (official)** | Cloud API throughput, quality rating, pairing bans. | Respect Meta limits; separate from Baileys 250/day. Pause on quality drop. |
| **Rate limits (Baileys)** | 250/day + warming; large audience takes days. | Preview “est. completion.” Split campaigns. Do not raise the cap without evidence. |
| **Jitter quality** | Uniform 1–3s is still a tight burst for hundreds of sends. | Ticket: configurable window, occasional longer pause, business-hours only. Still not a ban warranty. |
| **E.164 / US formats** | Invalid phones skip send (`isValidE164`). | Normalize on import; report skipped count. |

### 3.3 Platform / scale

| Challenge | Why it matters | Mitigation |
| --- | --- | --- |
| **Lite deploy is not HA** | One web, one worker, one Redis. Any container death stops QR, drain, or UI. | Operator SLA (staffed-hours), restart policy, health checks, host watchdog. Do not claim 99.99% without a second node **and** session-lock design. |
| **Redis loss** | BullMQ jobs vanish if Redis is ephemeral. | Compose volume; Redis AOF if production; reconstruct from `send_queue` / recipient `pending` (exists in parts). Runbook: replay pending. |
| **Worker restart mid-blast** | Duplicate or stuck recipients. | Jobs must be idempotent (recipient status). RateGovernor `firstSendSeen` is **in-memory** — first-send delay resets on process restart (acceptable). Daily count is in Postgres RPC. |
| **Multi-worker** | Two Baileys sockets = fight / ban. | **Single worker** invariant until a session lock (Redis) is designed. Document it. |
| **Multi-tenant isolation** | Schema is account-scoped + RLS. Product is **one tenant account** in v1, not a SaaS marketplace. | Keep RLS tests. Do not build a self-serve tenant portal in v1. API keys are account-scoped. |
| **Hosted Supabase quotas** | Sync of all groups + 5k+ contacts + messages can hit row/IO limits. | Batch 200–1000 (exists). Monitor dashboard. Upgrade plan before go-live. |
| **Cron reliability** | GitHub Actions can skip or secret-miss; host crontab can die. | Dual note in LITE-DEPLOY. Heartbeat. Manual curl runbook. Optional later: worker-side due-job poll (still one process). |
| **Windows Docker / nested npm** | Operator laptop is Windows. | `.npmrc` nested installs; webpack for `next dev`; production = `next start -p 3100`. See LITE-DEPLOY. |
| **Schema grants** | Past incident: missing GRANTs → empty groups/contacts (migrations 051–053). | Apply **all** migrations in order. Never `db reset` on the production project. |
| **Backup / RPO** | Session files + Postgres + Redis. Lose session = re-QR. | Supabase PITR on; volume backup; secrets in a password manager not git. Quarterly restore drill (US-13). |
| **Media / storage** | Broadcast images in Supabase storage. | Account-prefixed paths (exists). Caps; no clinical photos. |

### 3.4 Secrets, keys, A2A reliability

| Challenge | Why it matters | Mitigation |
| --- | --- | --- |
| **ENCRYPTION_KEY rotation / loss** | All WA tokens, SMTP, LLM keys, webhook secrets become unreadable. | 64-hex in host secret store. Rotation runbook + re-enter. Mismatch logs (AI embeddings already warn). Never commit `.env`. |
| **Key in browser / LLM logs** | Exfil. | GET strips keys; validate server-side; redact. |
| **BYOK vendor outage** | A2A and playground fail. | Fail closed; inbox still works. Show provider status. |
| **A2A not built yet** | US-10 / P0-6 incomplete. Agents cannot “talk.” | Ship Compliance as **server function first** (consent already). Then wrap in a card. Pin JSON-RPC subset; skip SSE v1. |
| **A2A loops / cost** | Agents call agents; token burn. | Max turns, per-conversation cap (auto-reply exists), per-task budget, circuit breaker. |
| **Agents bypass gates** | MCP writes could send without Compliance. | Gate in **send service**, not only the agent. Writes through existing services. |
| **Prompt injection / PHI in artifacts** | Lead pastes labs; model echoes to WA. | Deny-list on inbound + artifacts; do not persist clinical free text; escalate. |
| **Spec churn** | A2A 1.0 may move. | Pin operations: SendMessage, GetTask, CancelTask, GetAgentCard. |
| **MCP vs A2A dual-write** | Two write paths diverge. | MCP stays tools; A2A stays decisions. |

### 3.5 Enterprise SLA / ops

| Challenge | Why it matters | Mitigation |
| --- | --- | --- |
| **No formal SLA today** | Clinic will ask “is CRM up?” | Define operator SLA: e.g. health endpoints green, cron ≤ 5 min, worker connected, RTO 4h, RPO 24h (Supabase PITR tighter if paid). Lite deploy cannot promise multi-AZ. |
| **Observability gap** | Console logs ≠ enterprise. | Request id, account id, queue depth, send error codes, session state, cron last-ok. P1 log redaction (phone last-4). |
| **No SIEM / unified audit** | Who sent the blast? Who pasted a key? | Phase 3–4: audit table for consent, send, role, key, pair. Retain ≥ 1 year if counsel requires. |
| **RBAC holes** | Agent exports CSV of 4,907 phones. | Confirm export is admin+ (P0-8). Agents cannot disable consent. |
| **On-call** | Single operator (Ashish). | Runbooks in docs; do not page for vanity metrics. Ban / PHI leak / key leak are Sev-1. |
| **Staff training** | Luis pastes “your MRI is ready.” | Canned replies; deny-list; Phase 5 banners. |
| **Incident: number banned** | Channel dead. | Stop sends; Cloud API fallback if configured; notify; do not immediately re-QR from a new burner (ToS). |
| **Incident: Redis OOM** | Queue stall. | Memory cap, job retention, alert. |
| **Incident: webhook flood** | Inbound loop. | Existing rate limits; flow runner first. |
| **Change management** | Docs-only vs product commits mixed. | This PLAN/PRD/ARCHITECTURE change is docs only. Features land in their own PRs with tests. |

---

## 4. Cross-cutting out of scope (all phases)

- EHR, eRx, lab interfaces, insurance eligibility.
- Claiming HIPAA on WhatsApp.
- Merging `whatsapp-research` / `omnichat`.
- New Compose services (agent runtime, local Postgres, vector sidecar).
- Purchased SMS lists, scrape-based contact graphs.
- Multi-tenant public SaaS.
- Implementing product features in the same commit as these docs.

---

## 5. Suggested next tickets (after this docs merge)

1. Phase 1 compose + cron smoke on the production Supabase project (US-9, US-3).
2. QR test number + group sync counts: phones vs LID vs names vs email-empty (US-1).
3. Broadcast preview: eligible vs ineligible among the existing book — **do not send** (US-2, US-11).
4. PHI inbox banner + account-JSON extra terms (US-5). Deny-list on notes / KB / templates shipped.
5. Phase 2 remainder: campaigns create/update/resume + landings REST + webhook delivery queue (US-8) — **shipped**. Group-admin (add/remove/promote) still deferred (not in worker).
6. Jitter policy settings + tests (US-2 gap).
7. Phase 4: Compliance card wrapping `lib/consent.ts` + deny-list (US-10, US-4 keys).
8. PHI extras: account-JSON deny terms, inbox banner, email List-Unsubscribe (US-5 / US-7).

---

*End of PLAN. Product rules: [PRD.md](./PRD.md). Diagrams: [ARCHITECTURE.md](./ARCHITECTURE.md).*
