# Phase 4 — /make-plan handoff

Self-contained. Do not open other audit files to run this prompt.

````
/make-plan Redesign AudienceGate frontend (public Landing, Features, Login, dashboard pages). Current design failed audit at 9/30 with critical gaps in principles #6 honest (0), and weak #2 useful / #4 understandable (1).

Verdict paragraph (quoted from the Rams audit):
> REDESIGN the AudienceGate frontend — login, dashboard shell, and the missing marketing site — because the Rams total is 9/30 and honesty (#6) scored 0 on a silent Sign-in signup.

Why redesign and not refine: load-bearing honesty scored 0 (silent account creation) and total is below 20.

Preserve from current design (MUST be non-empty — at minimum, name the brand tokens):
- Brand tokens navy `#060B14`, sky `#38BDF8`, Sora headings (`globals.css`, `layout.tsx`)
- Wordmark “AudienceGate” (`login/page.tsx:105`, `en.json:18`)
- Consent/STOP / not-clinical copy on tenant landings (`landing-form.tsx:61–64`, `p/[slug]/page.tsx:65`)
- Dark-default + existing operational routes (inbox, contacts, broadcasts, campaigns, settings)

Discard (MUST be non-empty — name the structural patterns causing the failures):
- Silent signup on Sign in (`login/page.tsx:61–80`) — #6
- `.bg-mesh` / glow theater (`globals.css:256–274`) — #5/#7
- Flat 13-item nav + duplicate account menus — #2/#10
- “Live analytics”, “AI Agents”, “WA Groups”, “Anti-Ban” as product promises — #4/#6

Top 3–5 moves from the audit (verbatim):
1. Principle #6 honest: Kill silent `signUp` on Sign in and the hidden `@wacrm.itgyani.com` append; button label must match the only action. Evidence: `login/page.tsx:53,61–80`.
2. Principle #4 understandable: Replace jargon nav (WA Groups, AI Agents, Flows, Broadcasts vs Campaigns) with plain labels and complete header titles; login needs a one-line category, not a wordmark only. Evidence: `en.json:23–30`, `header.tsx:21–37`, `login/page.tsx:105–110`.
3. Principle #10 / #5: Collapse duplicate chrome (one account menu, one page title) and remove mesh/glow theater so content is the figure. Evidence: `sidebar.tsx:339–404` vs `header.tsx:79–146`; `globals.css:256–274`.
4. Principle #2 useful: Restructure IA so consented campaign work is the primary path (fewer than 13 peer nav items; skip link; inert mobile drawer). Evidence: `sidebar.tsx:94–111,169–189`.
5. Principle #1 / #3 / #7: New public Landing + Features must follow the Attio/Linear bar — product artifact as hero (consent gate, eligible vs not-eligible audience, Compliance refuse), one accent (keep sky), no mesh, no “#1/10X/Without Limits” copy. Evidence: 01-evidence competitors; `app/page.tsx:4` has no marketing page.

Redesign principles in priority order:
1. Principle #6 Honest — every label maps 1:1 to the only action; no silent signup, no hidden email-domain append, no inflated “Live analytics” / “AI Agents” / “Anti-Ban” product promises
2. Principle #2 Useful — consented campaign work is the primary path; fewer than 13 peer nav items; skip link; inert mobile drawer
3. Principle #4 Understandable — plain labels instead of WA Groups / AI Agents / Flows / Broadcasts-vs-Campaigns jargon; complete header titles; login has a one-line category
4. Principle #10 As little design as possible / #3 Aesthetic — Attio/Linear bar: product-as-hero, one accent (keep sky), no slop; collapse duplicate chrome; content is the figure

Also state in the plan: Marketing Landing and Features do not exist — they are designed in this redesign, not refined. Preserve brand tokens and consent/STOP honesty on `/p/[slug]`. Do not recommend REFINE because the codebase is large.

Non-goals (do not design or implement these in this plan step):
- WhatsApp blasts
- Consent backfill
- HIPAA claims
- FluentCRM email/Woo clone
- Implementing the redesign in this plan step

Deliverables for the plan:
- New information architecture (not derived from old)
- New primary flow (low-fi, labeled, compared side-by-side to current)
- States checklist (empty, loading, error, success, focus, disabled)
- Migration path for users currently on the old design
- Cutover criteria (when is the old design retired)

Anti-patterns to guard against (specific to REDESIGN):
- Porting old structure under new styling
- Keeping both designs behind a flag indefinitely
- Redesigning to follow a trend rather than the principles above
- Treating the Preserve list as optional — it must be filled before this handoff is valid
- Purple mesh, 3D blobs, “unlock your potential”, fake avatars, glow CTAs
````
