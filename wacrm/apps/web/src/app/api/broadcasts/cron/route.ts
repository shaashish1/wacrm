import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  insertSendQueueJobs,
  markRecipientsQueued,
  type SendQueueJobInput,
} from '@/lib/broadcasts/enqueue-send-queue';
import { notifyBroadcastOwner } from '@/lib/broadcasts/notify';
import { resolveVariables } from '@/lib/broadcasts/personalize';
import type { VariableMapping } from '@/lib/broadcasts/personalize';
import { buildPlainSendJobs, type PlainMediaKind } from '@/lib/broadcasts/plain-jobs';
import {
  isBroadcastRecurrence,
  nextScheduledAt,
} from '@/lib/broadcasts/recurrence';
import { buildSendComponents } from '@/lib/whatsapp/template-send-builder';
import { isMessageTemplate } from '@/lib/whatsapp/template-row-guard';
import { sanitizePhoneForMeta, isValidE164 } from '@/lib/whatsapp/phone-utils';
import type { Contact, MessageTemplate } from '@/types';
import { loadMarketingEligibleIds } from '@/lib/consent';

/**
 * Drain due scheduled broadcasts onto send_queue.
 *
 * Auth: Authorization: Bearer $CRON_SECRET
 * Local: curl -H "Authorization: Bearer $env:CRON_SECRET" http://localhost:3100/api/broadcasts/cron
 *
 * Recurring (daily/weekly) rows are cloned to the next fire time after enqueue.
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
      .select(
        'id, name, user_id, account_id, template_name, template_language, template_variables, audience_filter, recurrence, scheduled_at',
      )
      .maybeSingle();
    if (!claimed) continue;

    try {
      await enqueueClaimedBroadcast(claimed);
      await cloneNextOccurrence(claimed);
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

async function cloneNextOccurrence(broadcast: {
  id: string;
  name: string;
  user_id: string | null;
  account_id: string;
  template_name: string;
  template_language: string;
  template_variables: Record<string, unknown> | null;
  audience_filter: Record<string, unknown> | null;
  recurrence: string | null;
  scheduled_at: string | null;
}) {
  if (!isBroadcastRecurrence(broadcast.recurrence)) return;
  const admin = supabaseAdmin();
  const nextAt = nextScheduledAt(
    broadcast.scheduled_at ?? new Date().toISOString(),
    broadcast.recurrence,
  );

  const { data: recipients, error: recErr } = await admin
    .from('broadcast_recipients')
    .select('contact_id')
    .eq('broadcast_id', broadcast.id)
    .not('contact_id', 'is', null);
  if (recErr) {
    console.warn('[broadcasts/cron] clone recipients read failed:', recErr.message);
    return;
  }
  const contactIds = [...new Set((recipients ?? []).map((r) => r.contact_id as string))];

  const { data: next, error: insErr } = await admin
    .from('broadcasts')
    .insert({
      user_id: broadcast.user_id,
      account_id: broadcast.account_id,
      name: broadcast.name,
      template_name: broadcast.template_name,
      template_language: broadcast.template_language,
      template_variables: broadcast.template_variables,
      audience_filter: broadcast.audience_filter,
      scheduled_at: nextAt,
      recurrence: broadcast.recurrence,
      status: 'scheduled',
      total_recipients: contactIds.length,
      sent_count: 0,
      delivered_count: 0,
      read_count: 0,
      replied_count: 0,
      failed_count: 0,
    })
    .select('id')
    .single();
  if (insErr || !next) {
    console.warn('[broadcasts/cron] clone insert failed:', insErr?.message);
    return;
  }

  if (contactIds.length === 0) return;
  const rows = contactIds.map((contact_id) => ({
    broadcast_id: next.id,
    contact_id,
    status: 'pending' as const,
  }));
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await admin.from('broadcast_recipients').insert(rows.slice(i, i + CHUNK));
    if (error) {
      console.warn('[broadcasts/cron] clone recipient insert failed:', error.message);
      return;
    }
  }
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

  const contactIdsForGate = (recipients ?? [])
    .map((r) => r.contact?.id as string | undefined)
    .filter((id): id is string => Boolean(id));
  const eligible = await loadMarketingEligibleIds(
    admin,
    broadcast.account_id,
    contactIdsForGate,
    'whatsapp',
  );
  const blockedIds = (recipients ?? [])
    .filter((r) => {
      const cid = r.contact?.id as string | undefined;
      return Boolean(cid && !eligible.has(cid));
    })
    .map((r) => r.id as string);
  for (let i = 0; i < blockedIds.length; i += 200) {
    await admin
      .from('broadcast_recipients')
      .update({
        status: 'failed',
        error_message: 'No marketing consent or opted out',
      })
      .in('id', blockedIds.slice(i, i + 200));
  }
  const allowedRecipients = (recipients ?? []).filter((r) => {
    const cid = r.contact?.id as string | undefined;
    return Boolean(cid && eligible.has(cid));
  });

  const isPlain = broadcast.template_name === 'plain_text';
  const jobs: SendQueueJobInput[] = [];
  const queuedIds: string[] = [];
  const vars = (broadcast.template_variables ?? {}) as Record<string, unknown>;

  if (isPlain) {
    const built = buildPlainSendJobs({
      accountId: broadcast.account_id,
      broadcastId: broadcast.id,
      body: String(vars.body ?? ''),
      mediaUrl: typeof vars.mediaUrl === 'string' ? vars.mediaUrl : undefined,
      mediaKind: (vars.mediaKind as PlainMediaKind) || 'image',
      recipients: allowedRecipients.map((r) => ({
        id: r.id as string,
        contact_id: r.contact_id as string | null,
        contact: r.contact as Contact | null,
      })),
    });
    jobs.push(...built.jobs);
    queuedIds.push(...built.queuedIds);
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

    const contactIds = allowedRecipients
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

    for (const r of allowedRecipients) {
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
