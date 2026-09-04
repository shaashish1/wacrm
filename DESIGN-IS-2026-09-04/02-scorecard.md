# Phase 2 — Scorecard

Locked by orchestrator. Tie-breaker already applied (lower score when uncertain). Scores were not altered by the file writer.

1. Good design is innovative — Score: 1/3
   Evidence: App is a 13-item glass CRM shell + mesh (`sidebar.tsx:94–107`, `globals.css:256–274`); no product-as-hero marketing (`app/page.tsx:4`). Attio/Linear use artifact-as-hero; FluentCRM/Wati use catalogs (01-evidence competitors).
   Justification: This is an existing dark-SaaS pattern with a navy/sky/Sora skin, not a restrained new form and not a wholesale FluentCRM clone — score 1 not 0 or 2.

2. Good design is useful — Score: 1/3
   Evidence: Sign-in and campaign routes exist, but 13 nav items, duplicate Settings/account menus, quick actions that do not create (`quick-actions.tsx:21–22`), no skip link, mobile drawer stays in tab order (`sidebar.tsx:169–189`).
   Justification: The operate-campaigns task is reachable but requires detours — not “unsupported” (0) and not “completes with only adjacent extra steps” (2).

3. Good design is aesthetic — Score: 1/3
   Evidence: Token system exists (navy/sky/Sora) but type one-offs 9/10/11/28, two focus recipes, red-400/amber leaks, duplicate h1s, mesh glow vs 0–1 accent bar (01-evidence visual + competitors).
   Justification: More than two inconsistencies and mesh noise — not “≤2 minor” (2) and not “no system” (0).

4. Good design is understandable — Score: 1/3
   Evidence: Jargon WA Groups / AI Agents / Flows / Broadcasts vs Campaigns (`en.json:23–30`); header titles fall back to Dashboard (`header.tsx:21–37`); login has no category line; CardTitle is a div.
   Justification: Several primary controls fail a first-time name test — more than one tooltip (2), but Sign in is still findable (not 0).

5. Good design is unobtrusive — Score: 1/3
   Evidence: `.bg-mesh` + logo glow + ping + 12-item nav + duplicate chrome (`globals.css:256–274`, `sidebar.tsx:196,258`, header+sidebar menus).
   Justification: Decoration and chrome compete with content — not quiet (2) and not fully dominating the page (0).

6. Good design is honest — Score: 0/3
   Evidence: Failed “Sign in” silently calls `signUp` (`login/page.tsx:61–80`); plus “Live analytics” (`en.json:69`) and hidden `@wacrm.itgyani.com` append (`login/page.tsx:53`).
   Justification: Silent account creation is a deceptive flow — rubric 0, not “2+ inflations only” (1).

7. Good design is long-lasting — Score: 1/3
   Evidence: 2023–24 markers: glass, radial mesh, ping badges, “AI Agents” label; Sora + tight tracking (01-evidence visual + copy). Attio/Linear avoid atmospheric gradients (competitors).
   Justification: Two–three dated markers, not a single one (2) and not locked to one fashion year wholesale (0).

8. Good design is thorough — Score: 1/3
   Evidence: Login success missing; contacts error/success toast-only; dashboard errors `console.error`; several chrome controls lack focus-visible (`login/page.tsx:88–91`, `dashboard/page.tsx:75–91`, `mode-toggle.tsx:30–33`).
   Justification: Two–three load-bearing states missing or rough — not one (2) and not four-plus default-browser (0).

9. Good design is environmentally friendly — Score: 1/3
   Evidence: Measured login JS 1,272,881 B dev; motion ungated; no prefers-reduced-motion; dark mode present (01-evidence weight).
   Justification: 500KB–2MB and motion always on is 1; not <500KB (2) and not >2MB/autoplay (0). Dev overstate noted; still score the measurement.

10. Good design is as little design as possible — Score: 1/3
   Evidence: Removable duplicates: account menu ×2, Settings ×3, duplicate h1, mesh/glow, crowded 12-item nav (01-evidence structural + visual).
   Justification: Three–five removable elements — not “≤2” (2) and not decoration-dominated (0).

**Total: 9/30**
