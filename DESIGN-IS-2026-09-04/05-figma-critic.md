# Phase 5 — Figma critic

**REJECT**

File: [AudienceGate — Frontend](https://www.figma.com/design/wmTHiZhQJVx7JQns66SNDy) · key `wmTHiZhQJVx7JQns66SNDy`  
Bar: `03-verdict.md`, `04-handoff-prompt.md`, `wacrm/docs/brand-context.md`  
Scored: what shipped on 2026-09-05, not intent.

This file would not leave a partner-level review at a fundable SF SaaS shop. Three marketing/auth posters do not make a product frontend. Five of eight artboards are empty navy rectangles. The one “product-as-hero” is a made-up metrics card with numbers the brand file forbids citing.

---

## Inspection method (do not treat as a softening)

Live Figma MCP (`use_figma`, `get_metadata`, `get_screenshot`) is call-capped on Starter team `1677700137066450453`. `cursor-ide-browser` failed to attach a lasting tab to the file URL this pass.

Evidence is therefore:

1. The construction scripts that created every page, frame, token, component, and string (node IDs, px, copy) in [Create Figma frontend pages](7017f334-d7b0-4def-8455-2b5b0e8df1aa).
2. That pass’s own screenshot notes: Landing title bar defaulted to white; Features H1/subtitle “may slightly overlap.”
3. That pass’s own completeness inventory (empty wrappers named).
4. The written bar above.

Quota running out is not an excuse. Incomplete work is a finding. If a later live pass shows a frame was filled after this write, update the inventory — do not upgrade the verdict unless Dashboard / Campaigns / Inbox exist as real product surfaces and the invented homepage counts are gone.

---

## What is actually in the file vs claimed

Claimed after the create pass: Landing 1440, Features 1440, Login 1440 “complete”; Landing 390, Login 390, Dashboard, Campaigns, Inbox “empty wrappers.”

| Page | Frame | Node (as created) | Size | What is actually there |
| --- | --- | --- | --- | --- |
| Marketing | `Landing / 1440` | `2:91` | 1440×2400, `clipsContent: true` | Header + hero + fake “Send check” + 3 honesty cards + footer. Shimmer cleared. |
| Marketing | `Features / 1440` | `2:92` | 1440×2200, `clipsContent: true` | Header + `/features` eyebrow + H1 + 6 stacked cards + footer. Creator noted H1 overlap. |
| Marketing | `Landing / 390` | `2:93` | 390×2200 | Empty wrapper. `placeholder = true` at create. |
| Auth | `Login / 1440` | `2:94` | 1440×900 | One happy-path card. Shimmer cleared. |
| Auth | `Login / 390` | `2:95` | 390×844 | Empty wrapper. Fill script died on MCP cap. |
| App | `Dashboard / 1440` | `2:96` | 1440×900 | Empty wrapper. Fill script died on MCP cap. |
| App | `Campaigns / 1440` | `2:97` (sibling of dash) | 1440×960 | Empty wrapper. Never filled. |
| App | `Inbox / 1440` | `2:98` (sibling of dash) | 1440×960 | Empty wrapper. Never filled. |

Also on Marketing, parked at **x = −900**: `AG/Button`, `AG/Input`, `AG/Badge`, `AG/NavItem`. A fourth “Foundations” page was attempted and rejected (Starter **3-page** cap). Tokens exist as collection `AudienceGate`, Dark mode only.

**Score the claim honestly:** 3 of 8 frames have content. 0 of 3 app frames have content. This is not “phase 1 of a frontend file.” It is an unfinished marketing poster with a login card.

---

## Findings (worst first)

### 1. App screens are empty — this is not a product frontend file

`Dashboard / 1440`, `Campaigns / 1440`, `Inbox / 1440` were created as navy auto-layout wrappers with `placeholder = true` and never filled. The dashboard fill (`2:96`, five nav items, one account menu, three summary tiles) was written and then killed by the same Starter cap.

`04-handoff-prompt.md` asked for Landing, Features, Login, **and dashboard pages**. `00-scope.md` locks `/dashboard`, `/campaigns`, `/inbox` as in-scope operator surfaces. A file named “Frontend” that stops at public posters is a marketing moodboard. Reject it as a product deliverable.

Empty wrappers are not a phase-1 win. They are unfinished work wearing a frame name.

### 2. Homepage numbers the brand file forbids

Landing artifact (`Send check` on `2:91`) prints:

- **482** — “Landing yes · can be scheduled”
- **4,425** — “Extract only · stays in CRM, out of send”
- **12** — “Honor immediately · never re-ask in-thread”

`brand-context.md` Proof: *“Numbers we can cite: None as achieved results. … Do not put them on a homepage as done.”* The 4,425 is a costume of the imported-book note (~4,907). There is no source, no date, no `[NEED: figure]`, no “Cedarline demo” label.

This is the same honesty class the Rams audit scored **0** for (`03-verdict.md` #6). Silent signup was copy-patched on Login. Fake metrics were then installed on the hero. The audit said kill “Live analytics.” This file invented a live-analytics tile row and called it consent math.

### 3. The hero artifact is not an AudienceGate surface

The brief asked for Attio/Linear **product-as-hero**: a real operator surface (consent gate, eligible vs not-eligible, Compliance refuse).

What shipped is a marketing widget named `Send check`:

- Title bar: `Campaign  ·  Spring consult series` + `Compliance refused` badge
- Formula line: `Audience = contact group ∩ active WhatsApp consent ∩ not opted out`
- Three count cards with `AG/Badge` instances
- Red refuse band restating the same three numbers

No sidebar. No schedule control. No empty-send-set state. No campaign list. No thread. The actual Campaigns and Inbox frames that would have grounded this are empty (`finding 1`).

A Cedarline marketer does not see the product. They see a deck slide that *talks about* the product. That is FluentCRM/Wati energy with darker paint — the bar we were told not to copy (`01-evidence.md` competitors; `00-scope.md` visual bar).

### 4. Features H1 collides; both marketing frames clip at a fake page height

Creator screenshot note, after `await wrapper.screenshot()` on `Features / 1440` (`2:92`): **H1 / subtitle may slightly overlap.**

Construction:

- Eyebrow: `/features` in sky, Type/Label
- H1: Type/H1 **Sora Bold 52 / 60 / −2.5%**, width **900**, string `What is shipped — not a catalog of promises.`
- Body immediately under it at Type/Body 16/24, width 760

52px Sora Bold at 900px will wrap that line. 60px line-height on a wrapping H1 with `layoutSizingHorizontal = FIXED` after append is how you get collision and clipped descenders. That is not a “slight” issue. It is a broken type block on the second of three “complete” frames.

Both marketing wrappers are **fixed height + `clipsContent: true`**: Landing 2400, Features 2200. Content that exceeds the box is eaten. A real page hugs or scrolls. These are poster boards.

### 5. Category line + three columns + badge soup — the slop template

Landing structure, in order:

1. Wordmark + ghost skip + 3 nav labels + dual CTAs  
2. Sky category line: `WhatsApp campaign CRM  ·  Consent gate`  
3. H1 + paragraph + dual CTAs again  
4. Artifact that is itself **three count columns + badges**  
5. Honesty strip: **three equal cards** (`Extract is not consent` / `Compliance can refuse` / `STOP is honored`)  
6. Footer lockup

That is the generic SaaS landing the brief named: *“category line + 3 columns + logo row.”* Swapping in consent nouns does not make it Linear. Linear puts the issue/board in the scroll. Attio puts the transcript in the hero. This file puts a lecture in three cards under a fake dashboard.

Features doubles down: six identical stroked cards, 20px pad, 12 radius, 1px border — a catalog. FluentCRM’s `#features` hash, navy edition.

### 6. `AG/` violates a locked brand rule

Components on the Marketing canvas: `AG/Button`, `AG/Input`, `AG/Badge`, `AG/NavItem`.

`brand-context.md`: *“Never abbreviate AudienceGate to AG.”* Also: *“Words we never use (public mark or claim): … never AG as the brand.”*

The file’s first reusable objects are named with a forbidden mark. That is not a private layer-name quibble. Those names ship into inspect, handoff, and Code Connect.

### 7. Skip link used as brand decoration

Landing header (`2:91` / `Header`): wordmark `AudienceGate` (Sora Bold 18), then a text node `Skip to content` at Type/Small, **opacity 0.4**, sitting in the brand stack.

A skip link is a first-focus control, not a grey caption under a logo. At 40% opacity it is neither usable nor hidden. It is cargo-cult accessibility from the audit’s “add a skip link” note, rendered as leftover text. The same 0.35-opacity skip was planned for the dashboard sidebar that never shipped.

### 8. No 390. Mobile was never designed.

`Landing / 390` (`2:93`) and `Login / 390` (`2:95`) are empty navy frames. The Login-390 fill died on the cap. Landing-390 was never even attempted.

A 1440-only marketing file is not a frontend. The operator (Maya at a clinic) will hit this on a phone. Shipping two empty 390 boards next to “complete” desktops is how you fake coverage.

### 9. Login is one state. The honesty line is a footnote, not a system.

`Login / 1440` (`2:94`): 420-wide card, wordmark 22, category line, focused email (`maya@cedarline.example`), default password bullets, full-width `Sign in`, then `Sign in means sign in. It does not create an account.`

What the handoff required and this frame does not have: error, disabled, loading, success, empty. `AG/Input` only has Default and Focus. No invalid ring. No `role=alert` analogue. No “forgot password” placement (the live app’s tab-order bug is simply omitted).

Copy is the one place the silent-signup wound was addressed. A sentence under the button is not a designed flow. The create-account path is a sky-colored text line, not a screen.

### 10. A Cedarline marketer cannot run consent-vs-extract in five seconds

H1 `Send only to people who said yes.` is the only line that would survive a cold read.

Then the file gets in its own way:

- Nav: `Features` / `Consent` / `Access` — “Consent” is not a page; “Access” is login-or-sales. Neither is the extract vs send distinction.
- The artifact leads with a set-theory formula and three invented counts, not with “this number can be texted / this number cannot.”
- The three cards repeat the body paragraph.
- Features H1 is meta (`What is shipped — not a catalog of promises.`) — designer talking to the audit, not to Maya.
- Footer: `Features   Sign in   Create account` as one muted string. Not links. Not IA.

Five-second test: she gets a slogan. She does not get an operator model. The screens that would show it (Campaigns compose, Inbox, Dashboard) are empty.

### 11. Audit-voice leftovers, not product voice

Landing note: `Sign in signs you in. Create account is a separate action. Not an EHR. Not HIPAA. Not a blast tool.`

Features footer: `AudienceGate  ·  Features that exist. No Live analytics. No Anti-Ban. No HIPAA.`

Features intro: `It is not FluentCRM email, not Woo, not a chatbot product, and not a HIPAA channel.`

`brand-context.md` voice: serious, specific, clinic-safe. Say the gate and the ledger. It does **not** say: narrate the audit discard list on the homepage.

This is the redesign talking to `04-handoff-prompt.md` instead of to a buyer. Every “not X” is a tell that the page has no proof and is filling space with guardrails.

### 12. First screenshot: artifact title bar went white

Creator, after the Landing screenshot: *“Landing looks right except the artifact title bar defaulted to white.”* Node `3:27` (`Title bar`) had no fill; a later call bound `color/card`.

Whether that fix stuck is unverified after the cap. The defect happening at all is the craft level: a hairline title bar on a dark “product” card flashing as a white bar. That is the same class as overlapping H1 — auto-layout without a fill, shipped, noticed in a screenshot, maybe patched in the same breath as the next page.

Also on that card: title bar stroke 1px, body padding 20, three inner cards each with their own 12-radius + 1-stroke. Nested chrome, no optical hierarchy. Not Attio’s one hairline.

### 13. Duplicate chrome the audit already told us to kill

Landing header **and** hero both carry `Sign in` + `Request access` (`AG/Button` Primary/Ghost). `03-verdict.md` move 3: collapse duplicate chrome so content is the figure.

Header also strokes a full-width 1px rule while sitting on the same navy as the page — a line that does no work. Footer repeats Features / Sign in / Create account as dead text.

### 14. File is structurally unable to host a real system

- Starter **three-page** limit: Marketing / Auth / App. Foundations (tokens + components) dumped onto Marketing at x = −900.
- Spacing tokens: 8 / 12 / 16 / 24 / 32. Actual layout uses **20, 28, 40, 48, 64, 72** hardcoded. The “system” is not used by the pages.
- Type styles exist (H1 52 through Button 14) and then the wordmark is one-off Sora Bold 18 / 22 / 16.
- Dark-only variable mode. Light is in the live app and was an a11y fail (sky on `#f4f8fc` ~2.4:1). Not designed.
- Button Label property is shared across Primary/Ghost (`Label#2:0`). Fine until someone needs different defaults; already a rushed set.

This is MCP output under a quota, not a design system a team can extend.

---

## What a strong v2 would change (specific)

1. **Draw the real Campaign send path as the only hero.** One 1440 frame: sidebar (Inbox / Audience / Campaigns / Deals / Settings — five, not thirteen), campaign row, eligible vs extract vs STOP as a **table or two lists**, Compliance refuse as a blocking banner with a reason that does not restate fake totals. No 482 / 4,425 / 12 unless labeled `Cedarline Wellness demo · [NEED: figure]`.
2. **Delete the three honesty cards and the Features catalog.** If Features exists, it is the same product artifact scrolled, dated (changelog row), not six stroked rows.
3. **Auto-height frames. No `clipsContent` poster boards.** No 2400/2200 magic heights.
4. **Fix type before adding pages.** One H1 size that wraps at the measure without colliding. Features H1 becomes a product sentence (`Extract is stored. It is not a send list.`), not a process note.
5. **Remove `Skip to content` from the wordmark.** If a skip control is shown, it is a focus style, not 40% caption.
6. **Rename `AG/*` to `AudienceGate/Button` (etc.).** Never AG.
7. **Login: four states on one card** (default, focus, error, submitting). Create account is a separate 1440, or a clear secondary button — not a sky sentence. No silent signup, no hidden `@wacrm.itgyani.com` in the mock.
8. **Ship 390 of Landing and Login as the same composition, not new layouts.** Then Dashboard / Campaigns / Inbox at 1440 **and** 390. Until those exist, do not call the file a frontend.
9. **One CTA in the header** (Sign in). Request access belongs in a footer or a later access page — not twin pills in header and hero.
10. **Kill audit-voice.** No “Not HIPAA / not FluentCRM / no Anti-Ban” on the homepage. Those are internal discard lists. Public copy: gate, ledger, STOP, consult/intro/tour.
11. **Do not park components on the marketing page.** New file on a plan that allows a Foundations page — or a page the Starter cap can actually hold without x = −900 junk.
12. **Bind spacing tokens the pages actually use**, or delete the unused collection. A token set the screens ignore is slop.

---

## Continue in this file or start over

**Start over.**

This file’s only salvage is the *idea* of the token list (navy `#060B14`, sky `#38BDF8`, Sora/Inter). The pages are not a foundation. Continuing here means:

- fighting a 3-page Starter cap with components living on Marketing
- filling empty wrappers next to a rejected hero
- inheriting `AG/` names and invented counts
- remaining blocked on the same MCP quota that produced the empties

Open a new file on a Pro/Full seat (or wait out the cap **and** still new-file). Rebuild three things first, in this order: Campaigns 1440 (real send-check), Login 1440 (states), Landing 1440 (that Campaigns frame as the hero). Everything else is downstream.

Do not implement Next.js from this file. It is not a spec.

---

## Inventory vs fundable bar (one screen)

| Bar item | This file |
| --- | --- |
| Product-as-hero (Attio/Linear) | Fake `Send check` widget; real app frames empty |
| One accent (sky) | Sky used; also refuse-red band + badge soup |
| Hairline, dated specificity | 1px borders everywhere; no date; no changelog |
| No mesh / glow / #1 / 10X | Mesh avoided. Replaced with metric theater. |
| Do not copy FluentCRM/Wati | 3-up cards + feature catalog copied |
| Honest labels | Login sentence yes; homepage counts no |
| Cedarline understands extract vs send in 5s | Slogan yes; operator model no |
| App screens | Missing |

---

## Return block

- **Verdict:** REJECT  
- **Path:** `D:\Projects\whatsapp\DESIGN-IS-2026-09-04\05-figma-critic.md`  
- **Top 5 wounds:** (1) Dashboard / Campaigns / Inbox empty — not a frontend file; (2) invented 482 / 4,425 / 12 on the hero; (3) fake “Send check” instead of the real product; (4) Features H1 overlap + clipped 2200/2400 posters; (5) category-line + 3-card + badge template.  
- **Figma:** https://www.figma.com/design/wmTHiZhQJVx7JQns66SNDy
