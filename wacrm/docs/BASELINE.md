# BASELINE — AudienceGate (wacrm repo; tenant #1 first wellness clinic)

**Repo:** `shaashish1/wacrm` (`main`)  
**Frozen product SHA:** `e65104b87a9ae344d66e0507811ceccb12bf6ffd`  
**Recorded:** 2026-08-30 (`git rev-parse HEAD` before this file landed; that commit is PRD + PLAN only)  
**Companions:** [PRD.md](./PRD.md), [PLAN.md](./PLAN.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [production.md](./production.md)

**Enterprise user stories** (QR extract, delayed Baileys broadcast, schedule, BYOK LLM keys, REST/sync, consent vs existing contacts) live in [PLAN §1](./PLAN.md) and [PRD §4.1](./PRD.md) — not here.

All product work extends **this repo only**. Do not fork a second WhatsApp stack.

---

## In scope (build here)

- Existing AudienceGate (`wacrm` codebase): inbox, contacts, contact-groups, wa-groups sync/import, broadcasts, email campaigns, automations, flows, pipelines, agents playground, MCP (`mcp-server` / `wacrm-mcp`), `/api/v1` (me, messages, contacts, conversations, broadcasts, webhooks, wa-groups, consents, contact-groups, campaigns, pipelines, deals).
- Lite production: **web `:3100` + worker `:4000` + Redis + hosted Supabase**. See [production.md](./production.md).
- Later phases on this tree: consent/marketing, full REST + group sync/admin, in-app A2A agents, clinic theme. Sequence and challenges are in the PLAN.

## Archived / do not merge

| Path | Status |
| --- | --- |
| `D:/Projects/whatsapp-research` | Archived. Booking/consent **ideas** only. Not a source tree to merge. |
| `D:/Projects/omnichat` | Archived. Calendar/freeBusy **ideas** only. Do not port voice, schema, or that Next app. |
| waapi-gateway | Ideas only. No new standalone gateway process. |
| `wacrm-site` | Marketing site repo. Clinic public pages live **in this app**. |

Do not keep patching those trees for product tickets.

## HIPAA / WhatsApp rule

WhatsApp is **marketing and generic scheduling only**. No BAA with Meta. No PHI on WhatsApp (diagnoses, meds, labs, SSN, MRN, insurance IDs, clinical notes). Encryption ≠ HIPAA. Clinical results go to a HIPAA-capable channel or in-clinic intake — not this inbox.

---

*End of BASELINE. Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md).*
