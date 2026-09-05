/**
 * Primary operator destinations (sidebar). Five peers — consented
 * campaign work, not a 13-item catalog.
 */
export const PRIMARY_NAV_HREFS = [
  "/inbox",
  "/contacts",
  "/campaigns",
  "/pipelines",
  "/settings",
] as const;

/**
 * Every authed-app path that still exists (including routes no longer
 * in the primary nav). Prefetch + "are we in the app?" checks use this
 * so a deep link to /broadcasts still warms the shell.
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
