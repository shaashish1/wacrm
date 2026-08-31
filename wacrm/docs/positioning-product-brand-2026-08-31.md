# Positioning & product brand — WhatsApp marketing CRM (above Doral)

**Locked public brand: AudienceGate** (31 Aug 2026). See [brand-context.md](./brand-context.md).

**31 Aug 2026** · Heuristic naming/positioning scores only · Basis: PRD, PLAN, ARCHITECTURE (brand-context now exists; no live customer interviews; web search for *obvious* collisions only)

This is **not** trademark clearance, not a domain purchase, and not legal advice. Doral Healthcare and Wellness stays **tenant #1 / first clinic**, never the product name. Repo/code can stay `wacrm`; this brief is a public-facing brand only.

---

## The one thing

The product is a **WhatsApp marketing CRM** with two facts a competitor cannot honestly paste over: **group extract is not consent**, and **Compliance can refuse the send**. Name the product after those facts (or after the A2A mesh that enforces them). Do not name it after Doral, after “healthcare,” or after unofficial-WhatsApp swagger. WaCRM is a fine internal codename and a weak public brand.

---

## Positioning line (category + difference)

**WhatsApp campaign CRM with a hard consent gate and an in-app A2A agent mesh — for marketing and consult bookings, not patient records.**

### Full statement (for decks; unpasteable clauses marked)

For **digital marketers and clinic owners running WhatsApp campaigns**  
who **cannot treat imported group phones as an audience**,  
**[Brand]** is a **WhatsApp marketing CRM**  
that **lets them capture prior consent, schedule eligible sends, and qualify/book generic consults without putting clinical data on the channel**,  
unlike **WhatsApp Business + spreadsheets, or blast-first inbox tools**,  
because **\*a Compliance agent (and the server consent ledger) can block the send, and extract stores phone vs LID honestly instead of inventing contacts\***.

\*Unpasteable pair. Wati / Respond.io / Interakt can claim inbox + broadcasts + “AI.” They do not, on this product’s terms, treat Compliance as a send-path hard gate or treat QR group extract as non-permission.

### Frame decision

| Frame | Verdict | Why |
| --- | --- | --- |
| WhatsApp marketing CRM + consent architecture | **Chosen** | Buyers already shop “WhatsApp CRM.” Difference is the gate + mesh, not a new category they have to learn. |
| Healthcare / patient-comms platform | Rejected | Implies EHR, HIPAA, clinical messaging. Meta has no BAA. Product forbids PHI on WhatsApp. |
| “AI agents for clinics” | Rejected | Sounds like a chatbot. The product is five specialists + MCP tools; Compliance is a gate, not a personality. |
| Unofficial WhatsApp growth / anti-ban tool | Rejected | Baileys jitter is risk reduction, not a ToS warranty. Marketing that brags about bans will attract the wrong buyer and the wrong regulator. |

---

## Scorecard — 12 names

Scores are **marketing judgement** (sayability, feature fit, clinic-safe tone, collision smell), 0–100. Not USPTO data.

### (A) Coined / unique

| Name | Why it fits | Tone | Domain risk (.com / .ai) | Trademark-ish caution (obvious only) | Score |
| --- | --- | --- | --- | --- | --- |
| **Gatrel** | Gate + relay: Broadcast Compliance as hard send-gate; A2A specialists hand work to each other. Maps to consent re-check at schedule fire, RateGovernor as *pacing* (do not market it as anti-ban). | Serious / tech | `.com` likely contested or parked; try `gatrel.ai` / `getgatrel.com`. | **Gatrel Enterprises** (US metal fab). **Gantrel** (small AI consultancy, one letter off). Different class; still a counsel question. | **82** |
| **Cardrel** | Agent **Card** + **relay**. Public name for the thing the architecture actually ships: cards at `/api/a2a/:id/agent-card.json`, tasks, opacity. | Tech | Short invented `.com` often taken. `.ai` more plausible. | **Candrel** (label printers). Phonetic neighbor **Caedrel** (esports streamer) — Google-noise, not a CRM. | **76** |
| **Nolven** | Empty vessel. You teach “consent-gated WhatsApp CRM.” Lowest semantic leak into healthcare or spam. | Neutral / serious | **nolven.com** is a long-standing registration (OVH, since 2009) — assume `.com` is **not** cheap. `.ai` unknown. | GitHub handle `Nolven` (hobby repos). **Noltven** (UK RPO / automation) is one letter off. No WhatsApp-CRM product found. | **74** |
| **Sovrel** | Sovereignty + relay: lite self-host (web + worker + Redis + hosted Supabase), BYOK LLM keys, account-scoped RLS. “Your keys, your stack.” | Serious / tech | Invented `.com` likely parked. | **Sovren Software** (agentic infra) is the dangerous phonetic neighbor. **Sovelia** (PLM) is farther. | **68** |

### (B) Descriptive but ownable

| Name | Why it fits | Tone | Domain risk | Trademark-ish caution | Score |
| --- | --- | --- | --- | --- | --- |
| **AudienceGate** | The product’s actual audience math: contact group ∩ active WhatsApp consent ∩ not `opted_out`. Imported ~4,907 rows stay in CRM and **out** of the send set until a landing yes. | Serious | Compound `.com` often taken or listed. `audiencegate.com` appeared as for-sale in search snippets. | **AudienceView**, **Audience Republic**, **XGATE**. **Audiencegage** (gamification) is a near-miss. No same-name WhatsApp CRM found. | **78** |
| **LandingLedger** | Public `/p/[slug]` landings write the consent ledger (copy, IP, UA, UTM) before any marketing WA. Matches US-6 and Phase 3. | Serious / warm | Two-word `.com` crowded. | **Land Ledger** / **LandLedger** (ag/land records) — phonetic collision if you say it fast. **LandedLedger** (Shopify). Spell it as one word and keep “landing page” in the subtitle. | **71** |
| **ConsultRelay** | Booking/Receptionist offers consult / intro / tour slots; Qualifier hands off; Luis stays in Inbox. Names the allowed appointment language. | Warm / serious | Likely more available than one-word coins. | **Call Relay**, **LexRelay**, **Consultly** — adjacent booking, different marks. Narrows the story to booking; CRM + broadcasts become the subtitle. | **70** |
| **CampaignGate** | Marketer UI → Content → Compliance → send. Schedule + jitter sit *after* the gate. | Serious | `campnigate.com` already used as **CampaignGate** campaign-management copy in directory listings. | **Treat as occupied in the marketing-tools class** until counsel says otherwise. **CampaignAgent** (campaign governance) is the same idea-space. | **52** — list only so you do not “invent” it later |

### (C) Agent / mesh-flavored

| Name | Why it fits | Tone | Domain risk | Trademark-ish caution | Score |
| --- | --- | --- | --- | --- | --- |
| **Quintrel** | Five in-app specialists: Compliance, Qualifier, Content, Booking, Analytics. Concierge is a router, not a sixth mascot. | Tech | Invented `.com` uncertain. | **Quintivel** is a **marketing CRM** (attribution + booking) — same shelf, bad neighbor. **Quintrell Ltd** (UK IT). **Quint** (formal specs). | **70** |
| **Taskrelay** | A2A unit of work is a **task** (`submitted` → `working` → done / `input-required`). Agents relay artifacts, not shared memory. | Tech | Generic compound; SEO will be noisy. `.ai` more brandable than `.com`. | Many “task” + “relay” products in automation. Weak distinctiveness. | **64** |
| **Cardmesh** | Agent Cards + same-origin mesh. MCP stays tools; A2A stays decisions. | Tech | `cardmesh.com` likely taken or unused junk. | Close to **SkillMesh** (MCP skill router — *do not use SkillMesh*). Card + mesh is descriptive enough to be hard to lock. | **63** |
| **Relaydesk** | Front-desk Inbox + agent relay to Qualifier/Booking. Luis-shaped. | Warm / tech | “Relay” + “desk” is crowded (helpdesks, call relays). | Sounds like a support ticket tool, not a campaign CRM. Fine as a *module* name later, weak as the company. | **60** |

**Dropped after search (do not revive without a new collision pass):** Vetora (NZ vet group + **Vetor CRM** is a WhatsApp CRM), Optara (US cybersecurity, HIPAA-in-the-copy, `optara.com`), Meshgate (`meshgate.dev` — AI-agent governance), Delegora (FR tenders + **Legora** legal AI), Consora (FI AP automation + TR consultancy), Yesora (`yesora.ai`), InboxLedger (`inboxledger.app` accounting), Pactora (legal AI), SkillMesh (taken), Optrel (welding PPE).

---

## Recommended shortlist of 3

### 1. Gatrel — default

**Use this if** you want a short invented word that still *means* the product: Compliance is a gate; agents relay. It sits above any clinic. “Powered by Gatrel” on a Doral landing does not say Doral built a hospital OS.

Say it: *GAT-rəl* or *gay-TREL* — pick one and stick it in the brand pack.

Subtitle to lock category: **Gatrel — WhatsApp campaign CRM**.

### 2. AudienceGate — clearest to Maya

**Use this if** the next buyer is a clinic marketer, not an A2A engineer. She already lives in audiences, landings, and “can I send this list?” The name answers: only the gated set.

Cost: longer logo, more generic, more `.com` pain. Keep a short spoken form (“AudienceGate”) and never abbreviate to AG (too many meanings).

### 3. Nolven — cleanest coined vessel

**Use this if** counsel flinches at Gatrel/Gantrel/Gatrel Enterprises, or you want a name with almost no existing software story. You will spend the first year teaching what it is. That is fine if the positioning line always travels with the name.

Do not pick Nolven to sound “premium empty SaaS.” Pair it immediately with the category line above.

**Sharp test contrast:** ship **Gatrel** vs **AudienceGate** as the only A/B on a one-pager. If five clinic-owner conversations need the category explained twice, you are in AudienceGate territory. If they repeat Gatrel without mixing it up with Doral, keep Gatrel.

---

## Do these first

1. **Lock the public name vs the repo.** Effort S · Confidence H  
   Public: one of the shortlist. Internal: `wacrm` stays. Never print “Doral CRM” on a second clinic’s UI.

2. **Buy the domain you can actually get, then stop hunting poetry.** Effort S · Confidence H  
   Pattern: `get[name].com` or `[name].ai` if `.com` is a 2009 parking lot (Nolven) or a steel shop (Gatrel Enterprises). Do not wait for a perfect `.com`.

3. **Counsel + USPTO/EUIPO search on the shortlist of 3.** Effort M · Confidence — not ours  
   We only did web-search collisions. That is a first filter, not clearance.

4. **Write the one-line lockup.** Effort S · Confidence H  
   `[Name] — WhatsApp campaign CRM`  
   Never: `[Name] — HIPAA WhatsApp` / `anti-ban` / `healthcare OS`.

5. **After the pick, fill `brand-context.md`.** Effort S · Confidence H  
   None exists today. Offer below. Without it, every later landing and email will drift back toward “AI-powered clinic platform.”

---

## What's already working

- The docs already separate **customer** (Doral) from **product** (WaCRM + marketing + A2A). The naming job is mostly refusing to collapse that.
- Consent ledger, STOP, landing opt-in, LID-vs-phone honesty, and “consult/intro/tour only” give you a real difference. You do not need a fake statistic to position.
- Lite deploy and BYOK are operator-credible. They belong in the *how*, not in the brand name.

---

## What NOT to use

| Avoid | Why |
| --- | --- |
| **Doral**, Doral Health, Doral CRM, DoralOS | Tenant #1. The next clinic will not wear another clinic’s name. |
| **WaCRM** as the public brand | Reads as an internal repo (`shaashish1/wacrm`). Fine on GitHub. Weak on a landing and in a Meta Business review. |
| **WhatsApp / WA-** in the mark | Meta trademark + looks unofficial. Category line can say WhatsApp; the logo should not. |
| HIPAA, PHI, EHR, Pulse, Vital, Medi-, CareOS, ClinicCloud | Wrong category. Encryption ≠ HIPAA. No BAA. |
| Blast, Boom, Spray, Burst, ReachMax, BanProof, StealthWA, WarmBlaster | Spam energy. Jitter is not a warranty. |
| Meshgate, SkillMesh, Vetora, Optara, InboxLedger, Yesora, CampaignGate | Live or near-live products in agent, CRM, or campaign-tool space. |
| A cute sixth agent name as the company (Concierge, Maya, Luis) | Those are roles. The company is the gate + the mesh. |

---

## Cascade (when the name is picked)

- Doral landings (`/p/[slug]`): “Powered by [Brand]” not “Doral Healthcare software.”
- Settings / inbox banners: keep the WhatsApp-is-not-HIPAA fact; do not put HIPAA in the product name to “sound safe.”
- Later: homepage, outbound to other clinics, A2A card `name` fields — route through `copy.md` once `brand-context.md` exists.

---

## What I couldn't determine

- Whether Ashish wants this to stay a **one-clinic operator tool** or become a **multi-clinic product**. v1 docs say one Doral account; the *name* should still survive a second tenant.
- Actual `.com` / `.ai` buy price and owner (Whois snippets only; no registrar checkout).
- USPTO / EUIPO / common-law marks beyond obvious web hits. **Not a lawyer. Not clearance.**
- How Doral’s counsel will react to “gate” language (good legally, maybe cold for wellness creatives).
- Spoken pronunciation in Miami vs India operator calls — pick one IPA and test it out loud with Maya/Luis names.
- No `brand-context.md` in the repo, `.claude/`, or `.agents/`. This brief used product docs only. **Un-contextualised on voice/proof.** I can draft `brand-context.md` from this file the moment you pick a name — say the word.

---

## Proof we will not invent

Named customer you may use when they agree: **Doral Healthcare and Wellness** (tenant, not brand).  
Metrics in the PRD (time-to-first-response, 100% consent-block audits) are **targets**, not results. Do not put them on a homepage as achieved. `[NEED: figure]` after go-live.
