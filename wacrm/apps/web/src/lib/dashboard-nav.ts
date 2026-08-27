/**
 * Canonical authed-app destinations shown in the sidebar (main + bottom).
 * Kept as a data-only module so the root layout can prefetch these routes
 * without importing the client sidebar (and its icon graph).
 */
export const DASHBOARD_NAV_HREFS = [
  "/dashboard",
  "/inbox",
  "/notifications",
  "/contacts",
  "/pipelines",
  "/broadcasts",
  "/campaigns",
  "/automations",
  "/flows",
  "/agents",
  "/wa-groups",
  "/contact-groups",
  "/settings",
] as const;
