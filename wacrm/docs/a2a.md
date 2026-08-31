# A2A (in-app agents)

Same-origin Agent2Agent adapter next to MCP. MCP stays tools/data. A2A is agent ↔ agent (tasks + cards).

## Agents (P0)

| ID | Card | Skills |
| --- | --- | --- |
| `compliance` | Broadcast Compliance | `preflight_audience`, `review_copy`, `enforce_opt_out` |
| `qualifier` | Lead Qualifier | `qualify_inbound`, `score_lead`, `detect_phi_leak` |

Content, Booking, and Analytics are not shipped. Extend `apps/web/src/lib/a2a/`.

## Endpoints

- `GET /api/a2a` — list cards (session, viewer+)
- `GET /api/a2a/:agentId/agent-card.json`
- `POST /api/a2a` — JSON-RPC 2.0: `message/send`, `tasks/get`, `tasks/cancel`, `agents/list` (agent+)

Example:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "message/send",
  "params": {
    "agentId": "compliance",
    "skill": "preflight_audience",
    "message": { "data": { "contactIds": [], "copy": "Intro consult. Reply STOP." } }
  }
}
```

## Keys (US-4)

LLM calls reuse `ai_configs` (AES-256-GCM, `ENCRYPTION_KEY`). Qualifier uses rules first; optional LLM if a key is configured. Keys never appear in artifacts or logs.

## Gates

Compliance is a **hard gate** on Baileys/plain send and scheduled fire: no consent / opted out / PHI deny-list. WhatsApp is not HIPAA. Do not persist clinical free text.
