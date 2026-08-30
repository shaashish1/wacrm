import type { SupabaseClient } from '@supabase/supabase-js';

import { findOrCreateContact, resolveAuditUserId } from '@/lib/api/v1/contacts';
import { recordConsent } from '@/lib/consent';
import { sanitizePhoneForMeta, isValidE164 } from '@/lib/whatsapp/phone-utils';
import type { PublicLanding } from '@/lib/landings';

export interface LandingSubmitInput {
  name: string;
  phone: string;
  email?: string | null;
  consent: boolean;
  utm?: {
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    utm_content?: string | null;
    utm_term?: string | null;
  };
  ip?: string | null;
  userAgent?: string | null;
}

export async function submitLandingLead(
  db: SupabaseClient,
  landing: {
    id: string;
    account_id: string;
    consent_copy: string;
  } & Pick<PublicLanding, 'slug'>,
  input: LandingSubmitInput,
): Promise<{ contactId: string }> {
  if (!input.consent) {
    throw new Error('Marketing consent is required.');
  }
  const name = input.name.trim();
  if (!name) {
    throw new Error('Name is required.');
  }
  const sanitized = sanitizePhoneForMeta(input.phone);
  if (!isValidE164(sanitized)) {
    throw new Error('Enter a valid phone number (include country code).');
  }
  const email = input.email?.trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Enter a valid email, or leave it blank.');
  }

  const auditUserId = await resolveAuditUserId(db, landing.account_id);
  const { id: contactId } = await findOrCreateContact(
    db,
    landing.account_id,
    auditUserId,
    { phone: sanitized, name, email },
  );

  const now = new Date().toISOString();
  const utm = input.utm ?? {};
  const { data: existing } = await db
    .from('contacts')
    .select('first_touch_at, name, email')
    .eq('id', contactId)
    .maybeSingle();

  const patch: Record<string, unknown> = {
    opted_out: false,
    opted_out_at: null,
    landing_id: landing.id,
    last_touch_at: now,
    utm_source: utm.utm_source || null,
    utm_medium: utm.utm_medium || null,
    utm_campaign: utm.utm_campaign || null,
    utm_content: utm.utm_content || null,
    utm_term: utm.utm_term || null,
  };
  if (!existing?.first_touch_at) patch.first_touch_at = now;
  if (name && !existing?.name) patch.name = name;
  if (email && !existing?.email) patch.email = email;

  const { error: updateErr } = await db
    .from('contacts')
    .update(patch)
    .eq('id', contactId);
  if (updateErr) {
    throw new Error('Failed to save contact.');
  }

  const meta = {
    landing_slug: landing.slug,
    landing_id: landing.id,
    ...utm,
  };
  await recordConsent(db, {
    accountId: landing.account_id,
    contactId,
    phoneNormalized: sanitized,
    channel: 'whatsapp',
    source: 'landing',
    consentText: landing.consent_copy,
    ip: input.ip,
    userAgent: input.userAgent,
    meta,
  });
  if (email) {
    await recordConsent(db, {
      accountId: landing.account_id,
      contactId,
      phoneNormalized: sanitized,
      channel: 'email',
      source: 'landing',
      consentText: landing.consent_copy,
      ip: input.ip,
      userAgent: input.userAgent,
      meta,
    });
  }

  return { contactId };
}
