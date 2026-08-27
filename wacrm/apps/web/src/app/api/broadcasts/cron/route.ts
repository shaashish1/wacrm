import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  insertSendQueueJobs,
  markRecipientsQueued,
  type SendQueueJobInput,
} from '@/lib/broadcasts/enqueue-send-queue';
import { notifyBroadcastOwner } from '@/lib/broadcasts/notify';
import { substitutePlainText, resolveVariables } from '@/lib/broadcasts/personalize';
import type { VariableMapping } from '@/lib/broadcasts/personalize';
import { buildSendComponents } from '@/lib/whatsapp/template-send-builder';
import { isMessageTemplate } from '@/lib/whatsapp/template-row-guard';
import { sanitizePhoneForMeta, isValidE164 } from '@/lib/whatsapp/phone-utils';
import type { Contact, MessageTemplate } from '@/types';

/**
 * Drain due scheduled broadcasts onto send_queue.
 *
 * Auth: Authorization: Bearer $CRON_SECRET
 * Local: curl -H "Authorization: Bearer $env:CRON_SECRET" http://localhost:3100/api/broadcasts/cron
 *
 * Recurring broadcasts are not implemented — skip / later.
 */
function authorize(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

async function handle(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 });
  }
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const now = new Date().toISOString();
  const { data: due, error } = await admin
    .from('broadcasts')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!due || due.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  let processed = 0;
  for (const broadcast of due) {
    const { data: claimed } = await admin
      .from('broadcasts')
      .update({ status: 'sending' })
      .eq('id', broadcast.id)
      .eq('status', 'scheduled')
      .select('id, name, user_id, account_id, template_name, template_language, template_variables, audience_filter')
      .maybeSingle();
    if (!claimed) continue;

    try {
      await enqueueClaimedBroadcast(claimed);
      if (claimed.user_id && claimed.account_id) {
        await notifyBroadcastOwner({
          accountId: claimed.account_id,
          userId: claimed.user_id,
          type: 'broadcast_scheduled',
          title: `Scheduled broadcast started: ${claimed.name}`,
          body: 'The scheduled send is now in the outbound queue.',
        });
      }
      processed++;
    } catch (err) {
      console.error(`[broadcasts/cron] failed ${claimed.id}:`, err);
      await admin
        .from('broadcasts')
        .update({ status: 'failed' })
        .eq('id', claimed.id);
    }
  }

  return NextResponse.json({ processed });
}

async function enqueueClaimedBroadcast(broadcast: {
  id: string;
  account_id: string;
  template_name: string;
  template_language: string;
  template_variables: Record<string, unknown> | null;
  audience_filter: Record<string, unknown> | null;
}) {
  const admin = supabaseAdmin();
  const { data: recipients, error } = await admin
    .from('broadcast_recipients')
    .select('*, contact:contacts(*)')
    .eq('broadcast_id', broadcast.id)
    .in('status', ['pending', 'queued']);
  if (error) throw error;

  const isPlain = broadcast.template_name === 'plain_text';
  const jobs: SendQueueJobInput[] = [];
  const queuedIds: string[] = [];
  const vars = (broadcast.template_variables ?? {}) as Record<string, unknown>;

  if (isPlain) {
    const body = String(vars.body ?? '');
    const mediaUrl =
      typeof vars.mediaUrl === 'string' ? vars.mediaUrl.trim() : '';
    const mediaKind = (vars.mediaKind as 'image' | 'video' | 'document' | 'audio') || 'image';
    for (const r of recipients ?? []) {
      const contact = r.contact as Contact | null;
      const phone = contact?.phone;
      if (!phone || contact?.opted_out) continue;
      const sanitized = sanitizePhoneForMeta(phone);
      if (!isValidE164(sanitized)) continue;
      const text = substitutePlainText(body, contact);
      const options = {
        broadcastRecipientId: r.id,
        broadcastId: broadcast.id,
        contactId: r.contact_id,
      };
      jobs.push({
        accountId: broadcast.account_id,
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
  } else {
    const { data: rawTemplate } = await admin
      .from('message_templates')
      .select('*')
      .eq('account_id', broadcast.account_id)
      .eq('name', broadcast.template_name)
      .eq('language', broadcast.template_language || 'en_US')
      .maybeSingle();
    const templateRow =
      rawTemplate && isMessageTemplate(rawTemplate)
        ? (rawTemplate as MessageTemplate)
        : null;
    const mappings = vars as Record<string, VariableMapping>;
    const headerMediaUrl =
      typeof broadcast.audience_filter?.headerMediaUrl === 'string'
        ? broadcast.audience_filter.headerMediaUrl
        : undefined;

    const contactIds = (recipients ?? [])
      .map((r) => r.contact?.id)
      .filter((id): id is string => Boolean(id));
    const customIndex = new Map<string, Map<string, string>>();
    if (contactIds.length > 0) {
      const { data: cvs } = await admin
        .from('contact_custom_values')
        .select('contact_id, custom_field_id, value')
        .in('contact_id', contactIds.slice(0, 500));
      for (const row of cvs ?? []) {
        const bucket = customIndex.get(row.contact_id) ?? new Map<string, string>();
        bucket.set(row.custom_field_id, row.value ?? '');
        customIndex.set(row.contact_id, bucket);
      }
    }

    for (const r of recipients ?? []) {
      const contact = r.contact as Contact | null;
      const phone = contact?.phone;
      if (!phone || contact?.opted_out) continue;
      const sanitized = sanitizePhoneForMeta(phone);
      if (!isValidE164(sanitized)) continue;
      const params = resolveVariables(
        mappings,
        contact,
        customIndex.get(contact.id),
      );
      let components: unknown[] = [];
      if (templateRow) {
        components = buildSendComponents(templateRow, {
          body: params,
          headerMediaUrl,
        });
      } else if (params.length > 0) {
        components = [
          {
            type: 'body',
            parameters: params.map((p) => ({ type: 'text', text: String(p) })),
          },
        ];
      }
      jobs.push({
        accountId: broadcast.account_id,
        providerType: 'cloud_api',
        action: 'sendTemplate',
        payload: {
          to: sanitized,
          template_name: broadcast.template_name,
          template_language: broadcast.template_language,
          components,
          options: {
            broadcastRecipientId: r.id,
            broadcastId: broadcast.id,
            contactId: r.contact_id,
          },
        },
      });
      queuedIds.push(r.id);
    }
  }

  await insertSendQueueJobs(jobs);
  await markRecipientsQueued(queuedIds);
}
