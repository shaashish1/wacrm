import crypto from 'crypto';
import { decrypt } from '@/lib/whatsapp/encryption';

export interface MetaConversionEvent {
  event_name: string;
  event_time: number;
  user_data: {
    em?: string[]; // email
    ph?: string[]; // phone
    fn?: string[]; // first name
    ln?: string[]; // last name
    client_ip_address?: string;
    client_user_agent?: string;
  };
  custom_data?: any;
  action_source: string;
}

export function hashPii(value: string): string {
  if (!value) return '';
  const normalized = value.trim().toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export async function sendMetaConversionEvent(
  supabase: any,
  accountId: string,
  event: MetaConversionEvent,
  contactId?: string,
  dealId?: string
) {
  // 1. Fetch config
  const { data: config, error: configErr } = await supabase
    .from('meta_conversions_config')
    .select('*')
    .eq('account_id', accountId)
    .single();

  if (configErr || !config || !config.is_active) {
    return null;
  }

  const accessToken = config.access_token_encrypted ? decrypt(config.access_token_encrypted) : null;
  if (!accessToken) return null;

  // 2. Prepare payload
  // Normalize and hash PII
  if (event.user_data) {
    if (event.user_data.em) event.user_data.em = event.user_data.em.map(hashPii);
    if (event.user_data.ph) event.user_data.ph = event.user_data.ph.map(hashPii);
    if (event.user_data.fn) event.user_data.fn = event.user_data.fn.map(hashPii);
    if (event.user_data.ln) event.user_data.ln = event.user_data.ln.map(hashPii);
  }

  const payload = {
    data: [
      {
        event_name: event.event_name,
        event_time: event.event_time,
        user_data: event.user_data,
        custom_data: event.custom_data,
        action_source: event.action_source,
      }
    ],
    test_event_code: config.test_event_code || undefined,
  };

  // 3. Send to Meta
  const url = `https://graph.facebook.com/v19.0/${config.pixel_id}/events?access_token=${accessToken}`;
  
  let responseStatus = 0;
  let responseBody = null;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    responseStatus = res.status;
    responseBody = await res.json();
  } catch (err: any) {
    responseStatus = 500;
    responseBody = { error: err.message };
  }

  // 4. Log event
  await supabase.from('meta_conversion_events').insert({
    account_id: accountId,
    event_name: event.event_name,
    contact_id: contactId || null,
    deal_id: dealId || null,
    payload: payload,
    response_status: responseStatus,
    response_body: responseBody
  });

  return responseBody;
}
