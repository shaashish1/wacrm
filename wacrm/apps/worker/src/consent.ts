import type { SupabaseClient } from '@supabase/supabase-js';

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

export async function contactMayReceiveMarketing(
  db: SupabaseClient,
  contactId: string,
  channel: 'whatsapp' | 'email' = 'whatsapp',
): Promise<boolean> {
  const { data, error } = await db.rpc('contact_may_receive_marketing', {
    p_contact_id: contactId,
    p_channel: channel,
  });
  if (error) {
    console.warn('[consent] may-receive check failed:', error.message);
    return false;
  }
  return data === true;
}
