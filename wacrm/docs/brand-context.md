# Brand context

**Public product:** AudienceGate  
**Category lockup:** AudienceGate — WhatsApp campaign CRM  
**Locked:** 31 Aug 2026 · from [positioning-product-brand-2026-08-31.md](./positioning-product-brand-2026-08-31.md)  
**Internal / repo:** `wacrm` (`shaashish1/wacrm`, packages `@wacrm/*`). Not a public mark.

This is not trademark clearance, not a domain purchase, and not legal advice. Never abbreviate AudienceGate to **AG**.

---

## Product

What it is, in one sentence a stranger would understand:

**AudienceGate is a WhatsApp campaign CRM with a hard consent gate and an in-app A2A agent mesh — for marketing and consult bookings, not patient records.**

What it actually does (the mechanism, not the promise):

- Holds contacts, groups, inbox, campaigns, and landings in one operator app.
- Treats **group extract as not consent**. Imported phones stay in CRM and **out** of the send set until a landing (or other lawful) yes.
- Audience math: contact group ∩ active WhatsApp consent ∩ not `opted_out`.
- **Compliance can refuse the send.** The Compliance agent and the server consent ledger re-check at schedule fire. Content never auto-sends.
- Qualifies interest and books **generic consult / intro / tour** slots only. No clinical reason-for-visit on WhatsApp.
- Five in-app specialists (Compliance, Qualifier, Content, Booking, Analytics) over same-origin A2A. Concierge is a router, not the company.

What it does NOT do (this prevents overclaiming):

- Not an EHR, practice-management system, billing system, or patient-records platform.
- Not a HIPAA-covered WhatsApp channel. No BAA with Meta. Encryption ≠ HIPAA. **No PHI on WhatsApp.**
- Not a blast / anti-ban / unofficial-growth tool. RateGovernor jitter is pacing, not a ToS or ban warranty.
- Not a chatbot product. Agents are specialists + MCP tools; Compliance is a gate, not a personality.
- Not a multi-clinic marketplace in v1. The **name** still sits above any one clinic.

## Audience

Who buys it:

Digital marketers and clinic / wellness owners running WhatsApp campaigns (ICP stand-in: Maya). Operators who self-host the stack (Ashish).

What they believe before they arrive:

They already shop “WhatsApp CRM.” They may treat a group export or an old contact book as an audience.

What they worry about at 2am:

Sending to people who never said yes. A Meta or TCPA problem. Looking like a spam shop. Putting clinical detail on WhatsApp.

What they'd use instead if you didn't exist:

WhatsApp Business + spreadsheets, or blast-first inbox tools (Wati / Respond.io / Interakt and peers).

## Positioning

The one thing true about us that a competitor could not also say:

**Group extract is not consent, and Compliance (plus the consent ledger) can block the send.** Extract stores phone vs LID honestly instead of inventing contacts.

Category we compete in:

WhatsApp marketing CRM (consent architecture). Not “healthcare OS,” not “AI agents for clinics,” not unofficial WhatsApp growth.

Named competitors:

WhatsApp Business + spreadsheets; blast-first inbox CRMs that can claim inbox + broadcasts + “AI” without a send-path hard gate.

## Proof

Numbers we can cite (with source and date):

None as achieved results. PRD targets (time-to-first-response, 100% consent-block audits) stay **targets**. Write `[NEED: figure]` after go-live. Do not put them on a homepage as done.

Named customers we're allowed to name:

None. Tenant #1 is the first wellness clinic (docs may use the invented demo name **Cedarline Wellness**). Do not name a real clinic as the product. Early drafts formerly referred to as Doral — do not use.

Claims that need legal sign-off:

HIPAA, BAA, PHI-safe-as-certified, TCPA “compliant,” Meta ToS warranty, anti-ban, trademark/domain clearance. We do not invent these.

## Voice

How we sound:

Serious, specific, clinic-safe. Say the gate and the ledger. Short spoken form is **AudienceGate** (one word). Category line may say WhatsApp; the logo wordmark must not.

How we never sound:

Hospital OS, HIPAA-washed, “AI-powered clinic platform,” unofficial-WhatsApp swagger, spam energy, or another clinic’s name sold as the product.

Words we always use:

AudienceGate, WhatsApp campaign CRM, consent gate, consent ledger, extract is not consent, Compliance can refuse the send, consult / intro / tour, STOP, opted out, Powered by AudienceGate.

Words we never use (public mark or claim):

See do-not-use below. Also never **AG** as the brand.

## First tenant vs product

| | Product | Tenant #1 |
| --- | --- | --- |
| Name | **AudienceGate** | First wellness clinic (demo: **Cedarline Wellness**) |
| Where it appears | App chrome, `<title>`, login, sidebar, README heading, landing *product* footer, A2A card product copy, public docs product line | Seed/clinic example, PRD/PLAN facts, imported book (~4,907), “miami-event-leads,” operator deploy notes, landing *clinic* identity |
| Repo | `wacrm` stays internal | Not a repo name |

v1 may be one tenant account. A second clinic must not see another clinic’s name in the product chrome.

## Do-not-use

| Avoid | Why |
| --- | --- |
| Any real clinic name as the product (including early-draft clinic names) | Tenant #1 is not the mark. The next clinic will not wear another clinic’s name. |
| **WaCRM** as the public brand | Internal repo / packages (`shaashish1/wacrm`, `@wacrm/*`, `wacrm_live_` keys). Fine on GitHub. Weak on a landing and in a Meta Business review. |
| **WhatsApp / WA-** in the logo wordmark | Meta trademark + looks unofficial. Category line can say WhatsApp; the mark cannot. |
| HIPAA, PHI-as-certification, EHR, Pulse, Vital, Medi-, CareOS, ClinicCloud | Wrong category. Encryption ≠ HIPAA. No BAA. |
| Blast, Boom, Spray, Burst, ReachMax, BanProof, StealthWA, WarmBlaster | Spam energy. Jitter is not a warranty. |
| Meshgate, SkillMesh, Vetora, Optara, InboxLedger, Yesora, CampaignGate | Occupied or near-occupied in agent / CRM / campaign space. |
| Gatrel, Nolven, Cardrel, Sovrel, LandingLedger, ConsultRelay, Quintrel as *this* product | Shortlist leftovers. AudienceGate is the lock. |
| Concierge, Maya, Luis as the company | Roles. The company is the gate + the mesh. |

## Constraints

Regulatory or legal limits:

- WhatsApp is marketing and generic scheduling only. No clinical results, diagnoses, meds, labs, SSN, MRN, or insurance IDs on the channel.
- US / Florida marketing needs **prior express consent**. Group membership is not consent. Honor STOP.
- Do not backfill consent. Do not send WhatsApp from docs or brand work.
- USPTO / EUIPO / common-law search was not done here. Counsel still owns clearance.

Anything off-limits:

- Invented HIPAA/BAA claims, fake metrics, “anti-ban guaranteed.”
- Renaming the git remote, package name `wacrm`, or API key prefix `wacrm_live_` unless the string is a user-visible app title.
- Committing `.env` / secrets. Force-push.

---

## Cascade (when you write copy)

- Clinic landings (`/p/[slug]`): clinic name/headline from the landing row; footer **Powered by AudienceGate**.
- Settings / inbox: keep the WhatsApp-is-not-HIPAA *fact*; do not put HIPAA in the product name.
- Later homepage, outbound, A2A `name` fields: route through this file (and `copy.md` when it exists).
