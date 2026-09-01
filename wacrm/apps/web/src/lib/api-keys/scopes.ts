// ============================================================
// API key scopes — pure, unit-testable, no I/O.
//
// Authorization for the public API is *scopes-only*: a key's
// capabilities are defined entirely by the scopes granted to it at
// creation, independent of the role of the user who minted it. (We
// still gate *key creation* at admin+, so only trusted members can
// hand out capabilities — see the management routes.)
//
// A scope is `<resource>:<action>`. Endpoints declare the single
// scope they require; `requireApiKey(request, scope)` enforces it.
// Adding a capability = one entry here + the endpoint that checks
// it. No migration needed (the DB stores scopes as a free `text[]`).
// ============================================================

export const API_SCOPES = [
  'messages:send',
  'messages:read',
  'contacts:read',
  'contacts:write',
  'conversations:read',
  'broadcasts:send',
  'webhooks:manage',
  'a2a:invoke',
  'groups:read',
  'groups:admin',
  'consents:read',
  'contact-groups:read',
  'contact-groups:write',
  'campaigns:read',
  'campaigns:send',
  'pipelines:read',
  'pipelines:write',
  'landings:read',
  'landings:write',
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

/** Human-readable descriptions, surfaced in the key-creation UI. */
export const SCOPE_DESCRIPTIONS: Record<ApiScope, string> = {
  'messages:send': 'Send WhatsApp messages',
  'messages:read': 'Read messages and their delivery status',
  'contacts:read': 'List and read contacts',
  'contacts:write': 'Create and update contacts',
  'conversations:read': 'List and read conversations',
  'broadcasts:send': 'Launch broadcast campaigns',
  'webhooks:manage': 'Register and manage outbound event webhooks',
  'a2a:invoke': 'Invoke in-app A2A agents (cards + JSON-RPC)',
  'groups:read': 'List and read WhatsApp groups and participants',
  'groups:admin': 'Trigger WhatsApp group sync (and future admin actions)',
  'consents:read': 'List and read marketing consent ledger rows',
  'contact-groups:read': 'List and read CRM contact groups and members',
  'contact-groups:write': 'Create, update, and manage CRM contact groups',
  'campaigns:read': 'List and read drip campaigns and enrollments',
  'campaigns:send':
    'Create and update campaigns; enroll consented contacts; pause or resume (does not send WhatsApp)',
  'pipelines:read': 'List and read pipelines, stages, and deals',
  'pipelines:write': 'Create and manage pipelines, stages, and deals',
  'landings:read': 'List and read marketing landing pages',
  'landings:write': 'Create and update marketing landing pages',
};

/** Type-narrow an unknown value into a valid `ApiScope`. */
export function isApiScope(value: unknown): value is ApiScope {
  return (
    typeof value === 'string' &&
    (API_SCOPES as readonly string[]).includes(value)
  );
}

/**
 * Validate and de-duplicate a caller-supplied scope list. Returns
 * the cleaned list, or `null` if any entry is not a known scope
 * (callers turn that into a 400). An empty input is valid — it
 * yields a key that authenticates but can't do anything beyond the
 * scope-free endpoints (e.g. `GET /api/v1/me`).
 */
export function normalizeScopes(input: unknown): ApiScope[] | null {
  if (!Array.isArray(input)) return null;
  const out: ApiScope[] = [];
  for (const entry of input) {
    if (!isApiScope(entry)) return null;
    if (!out.includes(entry)) out.push(entry);
  }
  return out;
}

/**
 * True iff `granted` contains `required`. The single source of
 * truth for "is this key allowed to do X?" — both `requireApiKey`
 * and any future inline check should call this rather than poking
 * at the array directly.
 */
export function hasScope(
  granted: readonly string[],
  required: ApiScope
): boolean {
  return granted.includes(required);
}
