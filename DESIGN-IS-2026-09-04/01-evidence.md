# Phase 1 — Evidence (no scores)

**Audit folder:** `DESIGN-IS-2026-09-04/`  
**Product:** AudienceGate (`wacrm/apps/web`)  
**Surfaces:** missing public Landing + Features; existing Login + dashboard shell  
**Brand:** AudienceGate  
**Visual bar:** Attio/Linear; category peers FluentCRM + Wati  
**Date:** 2026-09-04

This file consolidates six evidence passes. Sources are cited. No scores.

---

## 1. Structural (ef01b471)

**Sources:** `login/page.tsx`, `dashboard-shell.tsx`, `sidebar.tsx`, `header.tsx`, `campaigns/page.tsx`, `inbox/page.tsx`, `app/page.tsx`

- Login interactive: 6 (`login/page.tsx` 129–197)
- Dashboard shell interactive: 26 (sidebar 169–402 + header 63–144 + mode-toggle)
- Max nesting depth: 9 (`dashboard-shell.tsx:43` → sidebar unread dot `sidebar.tsx:259`)
- Repeated-pattern types: 5
  - account menu ×2
  - dashboard nav ×2
  - close drawer ×2
  - Settings ×3
  - new broadcast ×4
- Dead/unused: 4 (`campaigns/page.tsx` createClient/supabase/Pause; `inbox/page.tsx` toast)
- Sidebar: 12 main + Settings
- `/` is `redirect('/dashboard')` (`app/page.tsx:4`)
- No `/features` (0 grep hits)
- Public marketing landing missing
- Tenant landings `/p/[slug]` exist
- Header `pageTitles` omits campaigns/flows/agents/wa-groups/contact-groups (`header.tsx:21–37`)
- Campaigns hardcoded “Drip Campaigns” (`campaigns/page.tsx:175`)

---

## 2. Visual (e9dc7f16) — INFERRED, no screenshots (browser MCP tab failed)

**Sources:** `globals.css`, `themes.ts`, `auth/layout.tsx`, `dashboard-shell.tsx`, `header.tsx`, `login/page.tsx`, `dashboard/page.tsx`

- Tokens: navy `#060b14` (`globals.css:92`), sky `#38bdf8` (`globals.css:155–165`), Sora on h1–h4 (`globals.css:247–253`), default dark+sky (`themes.ts:27,47`)
- Spacing px: [2,4,6,8,10,12,16,20,24,32,40,44,48,56]
- Type px: [9,10,11,12,14,16,18,20,24,28]
- Colors on default chrome: 17 hex/oklch; 50 in globals across accents
- Lowest primary-text contrast INFERRED 14.07:1 (`#e2e8f0` on `#111a2e`); muted light 4.73:1
- `.bg-mesh` three radial primary glows (`globals.css:256–274`) on auth + dashboard (`auth/layout.tsx:23`, `dashboard-shell.tsx:43`)
- Duplicate h1: chrome `header.tsx:71` + page titles
- Login states: loading+error+disabled present; empty N/A; success missing; password toggle `focus:outline-none` (`login/page.tsx:165`)
- Contacts: empty+loading+disabled present; error/success toast-only
- Dashboard fetch failures `console.error` only (`dashboard/page.tsx:75–91`)
- Live: `/login` HTTP 200; `/dashboard` 307 → login

---

## 3. Copy (c70607af)

**Sources:** `en.json`, `login/page.tsx`, `response-time-chart.tsx`, `queries.ts`, `quick-actions.tsx`, `activity-feed.tsx`, `header.tsx`, `landing-form.tsx`, `p/[slug]/page.tsx`

- Doral: 0 in apps/web UI. AudienceGate on login/sidebar/title/landing footer.
- Inflations:
  - “Live analytics…” (`en.json:69`)
  - “target 5m” (`response-time-chart.tsx:33`)
  - “AI Agents” vs brand “not a chatbot”
  - settings “Anti-Ban Strategy” (sampled)
- Dark pattern: failed Sign in silently `signUp` (`login/page.tsx:61–80`); bare username appends `@wacrm.itgyani.com` (`login/page.tsx:53`)
- Jargon: WA Groups, AI Agents, Flows+Beta, Broadcasts vs Campaigns, Contact Groups
- Mismatches:
  - Sign in ≠ maybe signup
  - Active Conversations number vs “new today” delta (`queries.ts:84–87`)
  - New Contact/Deal links list not create (`quick-actions.tsx:21–22`)
  - View all → `/inbox` not activity (`activity-feed.tsx:63–64`)
  - header titles fall back to Dashboard
- Landing PHI/STOP copy aligns with brand (`landing-form.tsx:61–64`, `p/[slug]/page.tsx:65`)

---

## 4. Weight (1e3a27c5) — `/login` on localhost:3100 DEV

- Initial JS: 1,272,881 B uncompressed (16 chunks)
- Network: 22 (HTML+JS+CSS+woff2+icon)
- TTI: ~3200 ms ESTIMATED
- Idle animations on login: 0; Sonner host: 1
- Full `en.json` (~82 KB) inlined on login via NextIntlClientProvider
- `tw-animate-css` global; PostHog from root; no `prefers-reduced-motion` in app CSS
- Dark mode present (`data-mode`, default dark)
- Authenticated shell (not measured live): 5 dashboard queries, 2 realtime channels, prefetch all nav routes

---

## 5. Accessibility (5c396dd7) — source; browser tab unavailable

**Sources:** `sidebar.tsx`, `card.tsx`, `login/page.tsx`

- Skip-link: NO
- Login landmarks: 0. Dashboard: 4 (`aside`, `nav`, `header`, `main`)
- Light-mode `text-primary` `#38bdf8` on `#f4f8fc` ~2.4:1 FAIL
- Dark body contrast PASS
- Login tab order: email → forgot (before password) → password → toggle → submit → create account
- Mobile drawer: off-screen links still tabbable; backdrop focusable when closed (`sidebar.tsx:169–189`); no inert/aria-hidden
- Login CardTitle is `<div>` not h1 (`card.tsx:36–46`); errors no `role=alert`; no autocomplete; loading no aria-busy
- Duplicate account menus

---

## 6. Competitors (0a058ba9) — LIVE_TEXT; no screenshots

**FluentCRM**
- WP-plugin marketing, purple `#7742e6` + yellow `#e6db44`, video hero, “Without Limits!”, 3-tier licenses, WhatsApp as a band
- `#features` is homepage hash; richer catalog at `/features/`

**Wati** (respond.io timed out)
- DM Sans, 4 bright hues, “#1”, “10X”, demo/trial/login chrome
- Growth-SaaS, not product-as-hero

**Attio**
- Product artifact as hero (transcript, @Attio, deals); black CTA; dated changelog 2026-08-25; named customers
- Third-party: Inter, white canvas, chroma in product only — px UNVERIFIED

**Linear**
- Issue/board/roadmap/diff as scroll; one lavender on `#010102`; dated changelog 2026-09-03; skip link
- Third-party: no atmospheric gradients — UNVERIFIED px

**Fundable bar (facts):** product-as-hero, 0–1 marketing accent, homepage changelog, named proof. Not icon-grid + mesh + superlatives.

---

## Known gaps (all passes)

- No live screenshots of AudienceGate dashboard or competitor pixels
- Dev JS overstates production gzip
- Light/non-sky accents not fully computed
- Settings anti-ban copy sampled only
