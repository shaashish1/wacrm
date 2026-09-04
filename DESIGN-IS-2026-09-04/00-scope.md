# Phase 0 — Scope lock

**Audit folder:** `DESIGN-IS-2026-09-04/`  
**Date locked:** 2026-09-04  
**Product:** AudienceGate — WhatsApp campaign CRM  
**Repo / packages:** `wacrm` (`@wacrm/*`)  
**Workspace:** `D:\Projects\whatsapp`  
**App root:** `wacrm/apps/web`  
**Live local:** `http://localhost:3100` (`next dev -p 3100`)

This file locks *what* is audited. No scores. No verdict.

---

## What is being audited

The **public marketing absence** plus the **existing operator chrome** — one product, four surfaces.

There is no Figma file in this workspace. Do not invent one. Competitor and live-app evidence comes from `cursor-ide-browser` screens plus repo source.

**Input materials (exist today):**

- Brand lock: `wacrm/docs/brand-context.md`
- Tokens / type: `wacrm/apps/web/src/app/globals.css`, `wacrm/apps/web/src/app/layout.tsx` (Sora + Inter)
- App chrome: `wacrm/apps/web/src/app/(dashboard)/layout.tsx`, `wacrm/apps/web/src/components/layout/sidebar.tsx`
- Auth chrome: `wacrm/apps/web/src/app/(auth)/layout.tsx`, `wacrm/apps/web/src/app/(auth)/login/page.tsx`
- Root route: `wacrm/apps/web/src/app/page.tsx` (redirects `/` → `/dashboard`; no marketing homepage)

---

## Surfaces — URLs and paths

| # | Surface | Status | URL | Source path |
| --- | --- | --- | --- | --- |
| 1 | Public Landing | **NEW** — does not exist | intended `/` (today: redirect) | no page; `src/app/page.tsx` is a redirect only |
| 2 | Public Features | **NEW** — does not exist | intended `/features` | no `src/app/features/` |
| 3 | Login | **Existing** | `/login` | `src/app/(auth)/login/page.tsx` |
| 4 | Dashboard / app | **Existing** | `/dashboard` and siblings | `src/app/(dashboard)/…` |

**Existing app pages in scope (chrome + primary task, not every sub-flow):**

| Route | File |
| --- | --- |
| `/dashboard` | `src/app/(dashboard)/dashboard/page.tsx` |
| `/inbox` | `src/app/(dashboard)/inbox/page.tsx` |
| `/contacts` | `src/app/(dashboard)/contacts/page.tsx` |
| `/contact-groups` | `src/app/(dashboard)/contact-groups/page.tsx` |
| `/broadcasts` | `src/app/(dashboard)/broadcasts/page.tsx` |
| `/campaigns` | `src/app/(dashboard)/campaigns/page.tsx` |
| `/settings` | `src/app/(dashboard)/settings/page.tsx` |

Adjacent chrome (same shell; inspect only as it affects the primary task): `/notifications`, `/pipelines`, `/automations`, `/flows`, `/agents`, `/wa-groups`.

**Adjacent public routes, not the marketing product:** `/signup`, `/forgot-password`, `/privacy`, `/terms`, `/p/[slug]` and `/l/[slug]` (clinic landings), `/join/[token]`. Mention only if they leak into product chrome or honesty claims.

---

## Primary user

Clinic / wellness **digital marketer** — tenant #1 style: **Cedarline Wellness**.

Buys and operates AudienceGate. Is not the product name. Does not need a clinic brand site.

---

## Primary task

**Understand the product → sign in → operate consented WhatsApp campaigns.**

Consented audience, not a blast of an imported book. Group extract is not consent.

---

## Goal of the larger effort

A frontend that reads as a **fundable Silicon Valley SaaS**.

Not AI slop. Not a clinic brand site. Not WaCRM as a public mark. Not Doral as a product name.

---

## Constraints

| Kind | Lock |
| --- | --- |
| Stack | Next.js + Tailwind in `wacrm/apps/web` |
| Brand | `wacrm/docs/brand-context.md` — public name **AudienceGate**; never **AG**; repo `wacrm` stays internal |
| Category | Marketing-only WhatsApp. No HIPAA, no BAA, no PHI on the channel. Not an EHR. |
| Naming | **Doral is not the product.** Tenant demo: Cedarline Wellness. Clinic name ≠ product chrome. |
| Tokens today | Navy `#060B14` (`--background` dark), sky `#38BDF8` (`--primary`, default theme), **Sora** (plus Inter) already shipped |
| Theme today | Default dark + sky (`wacrm/apps/web/src/lib/themes.ts`) |
| Visual bar | Visual language only — not feature-count vanity |

---

## Competitors — visual bar only

**WhatsApp-CRM / CRM feature bar (structure, density, honesty of “features”):**

- FluentCRM — https://fluentcrm.com/#features (primary reference)
- Wati
- Respond.io

**Fundable SaaS visual peers (restraint, type, chrome, empty space — not feature lists):**

- Attio
- Linear
- Stripe

Use `cursor-ide-browser` for live competitor screens. Do not invent Figma comps.

---

## New vs existing

**Existing (audit what ships):**

- Login and the dashboard/app shell: sidebar, tokens, type, empty/error density, copy honesty.
- `/` is not a landing — it dumps an unauthenticated visitor toward `/dashboard`.
- No public Features page.

**New (audit the absence; later work will create these):**

- Public Landing at `/`
- Public Features at `/features`

Later phases must score **current marketing absence + current app chrome** together. Do not score a hypothetical landing as if it already exists.

---

## Out of scope (this audit folder)

- Implementing the redesign
- WhatsApp sends
- Backend / API work
- Inventing a Figma file
- Scoring (that is `02-scorecard.md`, not this file)
