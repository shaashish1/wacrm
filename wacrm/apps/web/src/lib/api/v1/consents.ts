// ============================================================
// Public-API consent ledger serializer. Read-only: this never
// backfills or invents a grant. Importing a group is not consent.
// ============================================================

export interface ApiConsent {
  id: string;
  contact_id: string | null;
  phone_normalized: string | null;
  channel: string;
  source: string;
  granted_at: string;
  revoked_at: string | null;
  consent_text: string | null;
  created_at: string;
}

export function serializeConsent(row: Record<string, unknown>): ApiConsent {
  return {
    id: row.id as string,
    contact_id: (row.contact_id as string | null) ?? null,
    phone_normalized: (row.phone_normalized as string | null) ?? null,
    channel: row.channel as string,
    source: row.source as string,
    granted_at: row.granted_at as string,
    revoked_at: (row.revoked_at as string | null) ?? null,
    consent_text: (row.consent_text as string | null) ?? null,
    created_at: row.created_at as string,
  };
}
