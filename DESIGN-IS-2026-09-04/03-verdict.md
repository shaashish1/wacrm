# Phase 3 — Verdict

**REDESIGN**

REDESIGN the AudienceGate frontend — login, dashboard shell, and the missing marketing site — because the Rams total is 9/30 and honesty (#6) scored 0 on a silent Sign-in signup.

Marketing Landing and Features do not exist — they are designed in this redesign, not refined. Preserve brand tokens and consent/STOP honesty on `/p/[slug]`. Do not recommend REFINE because the codebase is large.

## Highest-leverage moves

1. Principle #6 honest: Kill silent `signUp` on Sign in and the hidden `@wacrm.itgyani.com` append; button label must match the only action. Evidence: `login/page.tsx:53,61–80`.
2. Principle #4 understandable: Replace jargon nav (WA Groups, AI Agents, Flows, Broadcasts vs Campaigns) with plain labels and complete header titles; login needs a one-line category, not a wordmark only. Evidence: `en.json:23–30`, `header.tsx:21–37`, `login/page.tsx:105–110`.
3. Principle #10 / #5: Collapse duplicate chrome (one account menu, one page title) and remove mesh/glow theater so content is the figure. Evidence: `sidebar.tsx:339–404` vs `header.tsx:79–146`; `globals.css:256–274`.
4. Principle #2 useful: Restructure IA so consented campaign work is the primary path (fewer than 13 peer nav items; skip link; inert mobile drawer). Evidence: `sidebar.tsx:94–111,169–189`.
5. Principle #1 / #3 / #7: New public Landing + Features must follow the Attio/Linear bar — product artifact as hero (consent gate, eligible vs not-eligible audience, Compliance refuse), one accent (keep sky), no mesh, no “#1/10X/Without Limits” copy. Evidence: 01-evidence competitors; `app/page.tsx:4` has no marketing page.
