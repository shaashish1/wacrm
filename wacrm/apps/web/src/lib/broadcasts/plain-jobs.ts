import { substitutePlainText } from '@/lib/broadcasts/personalize';
import { sanitizePhoneForMeta, isValidE164 } from '@/lib/whatsapp/phone-utils';
import type { SendQueueJobInput } from '@/lib/broadcasts/enqueue-send-queue';
import type { Contact } from '@/types';

export type PlainMediaKind = 'image' | 'video' | 'document' | 'audio';

export interface PlainRecipientRow {
  id: string;
  contact_id: string | null;
  contact: Contact | null;
}

/**
 * Build durable send_queue jobs for a wwebjs plain-text (optional media)
 * broadcast. Skips opted-out contacts and invalid phones.
 */
export function buildPlainSendJobs(args: {
  accountId: string;
  broadcastId: string;
  body: string;
  mediaUrl?: string;
  mediaKind?: PlainMediaKind;
  recipients: PlainRecipientRow[];
}): { jobs: SendQueueJobInput[]; queuedIds: string[] } {
  const mediaUrl = args.mediaUrl?.trim() ?? '';
  const mediaKind = args.mediaKind || 'image';
  const jobs: SendQueueJobInput[] = [];
  const queuedIds: string[] = [];

  for (const r of args.recipients) {
    const contact = r.contact;
    const phone = contact?.phone;
    if (!phone || contact?.opted_out) continue;
    // Consent is enforced by the caller (audience resolver) and again
    // in the worker drain. Skip opted-out here as a last local check.
    const sanitized = sanitizePhoneForMeta(phone);
    if (!isValidE164(sanitized)) continue;
    const text = substitutePlainText(args.body, contact);
    const options = {
      broadcastRecipientId: r.id,
      broadcastId: args.broadcastId,
      contactId: r.contact_id,
    };
    jobs.push({
      accountId: args.accountId,
      providerType: 'wwebjs',
      action: mediaUrl ? 'sendMedia' : 'sendText',
      payload: mediaUrl
        ? {
            to: sanitized,
            kind: mediaKind,
            media: { link: mediaUrl },
            caption: text,
            options,
          }
        : { to: sanitized, body: text, options },
    });
    queuedIds.push(r.id);
  }

  return { jobs, queuedIds };
}
