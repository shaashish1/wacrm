/**
 * Marketing consent ledger helpers. Broadcasts and campaign sends must
 * refuse contacts who are opted_out or have no active consent row.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type MarketingChannel = 'whatsapp' | 'email';

export const NO_CONSENT_MESSAGE =
  'No recipients have marketing consent (or all opted out). Capture consent on a landing page before sending.';

const PAGE = 500;

export async function recordConsent(
  db: SupabaseClient,
  input: {
    accountId: string;
    contactId: string;
    phoneNormalized: string;
    channel: MarketingChannel;
    source: string;
    consentText: string;
    ip?: string | null;
    userAgent?: string | null;
    meta?: Record<string, unknown> | null;
  },
): Promise<void> {
  const { error } = await db.from('consents').insert({
    account_id: input.accountId,
    contact_id: input.contactId,
    phone_normalized: input.phoneNormalized || null,
    channel: input.channel,
    source: input.source,
    consent_text: input.consentText,
    ip: input.ip ?? null,
    user_agent: input.userAgent ?? null,
    meta: input.meta ?? null,
    granted_at: new Date().toISOString(),
  });
  if (error) {
    throw new Error(`Failed to record consent: ${error.message}`);
  }
}

export async function revokeMarketingConsent(
  db: SupabaseClient,
  accountId: string,
  opts: { contactId?: string | null; phoneNormalized?: string | null },
): Promise<void> {
  let query = db
    .from('consents')
    .update({ revoked_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .is('revoked_at', null);

  if (opts.contactId && opts.phoneNormalized) {
    query = query.or(
      `contact_id.eq.${opts.contactId},phone_normalized.eq.${opts.phoneNormalized}`,
    );
  } else if (opts.contactId) {
    query = query.eq('contact_id', opts.contactId);
  } else if (opts.phoneNormalized) {
    query = query.eq('phone_normalized', opts.phoneNormalized);
  } else {
    return;
  }

  const { error } = await query;
  if (error) {
    console.warn('[consent] revoke failed:', error.message);
  }
}

export async function applyOptOut(
  db: SupabaseClient,
  accountId: string,
  opts: { contactId?: string | null; phoneNormalized?: string | null },
): Promise<void> {
  const now = new Date().toISOString();
  if (opts.contactId) {
    const { error } = await db
      .from('contacts')
      .update({ opted_out: true, opted_out_at: now })
      .eq('id', opts.contactId)
      .eq('account_id', accountId);
    if (error) {
      console.warn('[consent] opted_out update failed:', error.message);
    }
  } else if (opts.phoneNormalized) {
    const { error } = await db
      .from('contacts')
      .update({ opted_out: true, opted_out_at: now })
      .eq('account_id', accountId)
      .eq('phone_normalized', opts.phoneNormalized);
    if (error) {
      console.warn('[consent] opted_out update failed:', error.message);
    }
  }
  await revokeMarketingConsent(db, accountId, opts);
}

/**
 * Contact ids that may receive marketing on `channel`.
 * opted_out or missing active consent → excluded.
 */
export async function loadMarketingEligibleIds(
  db: SupabaseClient,
  accountId: string,
  contactIds: string[],
  channel: MarketingChannel = 'whatsapp',
): Promise<Set<string>> {
  const eligible = new Set<string>();
  if (contactIds.length === 0) return eligible;

  const optedOut = new Set<string>();
  for (let i = 0; i < contactIds.length; i += PAGE) {
    const slice = contactIds.slice(i, i + PAGE);
    const { data, error } = await db
      .from('contacts')
      .select('id, opted_out')
      .eq('account_id', accountId)
      .in('id', slice);
    if (error) {
      throw new Error(`Failed to load contacts for consent gate: ${error.message}`);
    }
    for (const row of data ?? []) {
      if (row.opted_out) optedOut.add(row.id as string);
    }
  }

  const candidates = contactIds.filter((id) => !optedOut.has(id));
  for (let i = 0; i < candidates.length; i += PAGE) {
    const slice = candidates.slice(i, i + PAGE);
    const { data, error } = await db
      .from('consents')
      .select('contact_id')
      .eq('account_id', accountId)
      .eq('channel', channel)
      .is('revoked_at', null)
      .in('contact_id', slice);
    if (error) {
      throw new Error(`Failed to load consents: ${error.message}`);
    }
    for (const row of data ?? []) {
      if (row.contact_id) eligible.add(row.contact_id as string);
    }
  }

  return eligible;
}

export function filterByEligibleIds<T extends { id: string; opted_out?: boolean }>(
  contacts: T[],
  eligibleIds: Set<string>,
): T[] {
  return contacts.filter((c) => !c.opted_out && eligibleIds.has(c.id));
}

export async function filterMarketingEligible<
  T extends { id: string; opted_out?: boolean },
>(
  db: SupabaseClient,
  accountId: string,
  contacts: T[],
  channel: MarketingChannel = 'whatsapp',
): Promise<T[]> {
  const ids = contacts.map((c) => c.id);
  const eligible = await loadMarketingEligibleIds(db, accountId, ids, channel);
  return filterByEligibleIds(contacts, eligible);
}

export async function countMarketingEligibility(
  db: SupabaseClient,
  accountId: string,
  contactIds: string[],
  channel: MarketingChannel = 'whatsapp',
): Promise<{ eligible: number; ineligible: number; total: number }> {
  const unique = [...new Set(contactIds.filter(Boolean))];
  const eligible = await loadMarketingEligibleIds(db, accountId, unique, channel);
  return {
    eligible: eligible.size,
    ineligible: unique.length - eligible.size,
    total: unique.length,
  };
}
