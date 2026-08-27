import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';
const META_API_VERSION = 'v21.0';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function decryptToken(encryptedText: string): string {
  if (!ENCRYPTION_KEY) return encryptedText;
  const parts = encryptedText.split(':');
  const keyBuf = Buffer.from(ENCRYPTION_KEY, 'hex');
  if (parts.length === 3) {
    const [ivHex, ctHex, tagHex] = parts;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      keyBuf,
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(ctHex, 'hex', 'utf8') + decipher.final('utf8');
  }
  if (parts.length === 2) {
    const [ivHex, ctHex] = parts;
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      keyBuf,
      Buffer.from(ivHex, 'hex'),
    );
    return decipher.update(ctHex, 'hex', 'utf8') + decipher.final('utf8');
  }
  return encryptedText;
}

/**
 * Send a Cloud API template whose `components` were pre-built at
 * enqueue time (web `buildSendComponents`). Keeps Graph API details
 * out of the Baileys provider.
 */
export async function sendCloudApiTemplate(args: {
  accountId: string;
  to: string;
  templateName: string;
  languageCode: string;
  components?: unknown[];
}): Promise<{ messageId: string }> {
  const { data: config, error } = await supabase
    .from('whatsapp_config')
    .select('phone_number_id, access_token')
    .eq('account_id', args.accountId)
    .single();
  if (error || !config) {
    throw new Error('WhatsApp not configured for this account.');
  }

  const accessToken = decryptToken(config.access_token);
  const templatePayload: Record<string, unknown> = {
    name: args.templateName,
    language: { code: args.languageCode || 'en_US' },
  };
  if (args.components && args.components.length > 0) {
    templatePayload.components = args.components;
  }

  const url = `https://graph.facebook.com/${META_API_VERSION}/${config.phone_number_id}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: args.to,
      type: 'template',
      template: templatePayload,
    }),
  });

  if (!response.ok) {
    let message = `Meta API error: ${response.status}`;
    try {
      const data = (await response.json()) as { error?: { message?: string } };
      if (data.error?.message) message = data.error.message;
    } catch {
      /* keep fallback */
    }
    throw new Error(message);
  }

  const data = (await response.json()) as { messages?: Array<{ id: string }> };
  const messageId = data.messages?.[0]?.id;
  if (!messageId) throw new Error('Meta API returned no message id');
  return { messageId };
}
