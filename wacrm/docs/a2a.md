# A2A (in-app agents)

Same-origin Agent2Agent adapter next to MCP. MCP stays tools/data. A2A is agent ↔ agent (tasks + cards).

## Agents

| ID | Card | Skills |
| --- | --- | --- |
| `compliance` | Broadcast Compliance | `preflight_audience`, `review_copy`, `enforce_opt_out` |
| `qualifier` | Lead Qualifier | `qualify_inbound`, `score_lead`, `detect_phi_leak` |
| `content` | Content | `draft_whatsapp_template`, `draft_email`, `draft_landing_hero`, `calendar_item` |
| `booking` | Booking / Receptionist | `offer_slots`, `confirm_consult`, `cancel_consult`, `handoff_human` |
| `analytics` | Analytics | `campaign_funnel`, `agent_task_stats`, `opt_out_rate` |

Content never auto-sends; drafts are scanned with the same Compliance `review_copy` rules. Booking stores generic consult/intro/tour rows in `appointments` (migration **061**) — no reason-for-visit field. Analytics returns counts only (no message bodies).

Compliance remains the **hard gate** on the send path. WhatsApp is not HIPAA.

## Endpoints

- `GET /api/a2a` — list cards (session viewer+, or API key `a2a:invoke`)
- `GET /api/a2a/:agentId/agent-card.json`
- `POST /api/a2a` — JSON-RPC 2.0: `message/send`, `tasks/get`, `tasks/cancel`, `agents/list` (session agent+, or `a2a:invoke`)

Example:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "message/send",
  "params": {
    "agentId": "content",
    "skill": "draft_whatsapp_template",
    "message": { "data": { "brief": "wellness-week intro consult" } }
  }
}
```

## Keys (US-4)

LLM calls reuse `ai_configs` (AES-256-GCM, `ENCRYPTION_KEY`). Qualifier and Content use rules first; optional LLM if a key is configured. Keys never appear in artifacts or logs.

## Gates

Compliance is a **hard gate** on Baileys/plain send and scheduled fire: no consent / opted out / PHI deny-list. WhatsApp is not HIPAA. Do not persist clinical free text.
