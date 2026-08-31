import type { SupabaseClient } from '@supabase/supabase-js';

import { BroadcastError } from '@/lib/whatsapp/broadcast-core';
import { findOrCreateContact } from '@/lib/api/v1/contacts';
import {
  insertSendQueueJobs,
  markRecipientsQueued,
} from '@/lib/broadcasts/enqueue-send-queue';
import { buildPlainSendJobs, type PlainMediaKind } from '@/lib/broadcasts/plain-jobs';
import { sanitizePhoneForMeta, isValidE164 } from '@/lib/whatsapp/phone-utils';
import type { Contact } from '@/types';
import { filterMarketingEligible, NO_CONSENT_MESSAGE } from '@/lib/consent';
import { normalizeJitterSeconds } from '@/lib/broadcasts/jitter';
import { reviewCopy } from '@/lib/a2a/compliance';

const MAX_RECIPIENTS = 1000;

export interface PlainAudienceInput {
  type: 'all' | 'tags' | 'group';
  tag_ids?: string[];
  group_ids?: string[];
}

export interface CreatePlainBroadcastParams {
  name?: string | null;
  body: string;
  mediaUrl?: string | null;
  mediaKind?: PlainMediaKind | null;
  recipients?: { to: string }[];
  audience?: PlainAudienceInput | null;
}

export interface PlainBroadcastResult {
  broadcastId: string;
  totalRecipients: number;
  rejected: number;
}

async function accountIsWwebjs(
  db: SupabaseClient,
  accountId: string,
): Promise<boolean> {
  const { data: account } = await db
    .from('accounts')
    .select('provider_type')
    .eq('id', accountId)
    .maybeSingle();
  if (account?.provider_type === 'wwebjs') return true;
  const { data: session } = await db
    .from('sessions')
    .select('provider_type')
    .eq('account_id', accountId)
    .maybeSingle();
  return session?.provider_type === 'wwebjs';
}

async function resolveAudienceContacts(
  db: SupabaseClient,
  accountId: string,
  audience: PlainAudienceInput,
): Promise<{ id: string; phone: string | null; name: string | null; opted_out?: boolean }[]> {
  if (audience.type === 'all') {
    const { data, error } = await db
      .from('contacts')
      .select('id, phone, name, opted_out')
      .eq('account_id', accountId)
      .or('opted_out.is.null,opted_out.eq.false');
    if (error) {
      throw new BroadcastError('internal', 'Failed to resolve audience', 500);
    }
    return filterMarketingEligible(db, accountId, data ?? [], 'whatsapp');
  }

  if (audience.type === 'tags') {
    const tagIds = (audience.tag_ids ?? []).filter((id) => typeof id === 'string');
    if (tagIds.length === 0) {
      throw new BroadcastError(
        'bad_request',
        "audience.type 'tags' requires non-empty tag_ids",
        400,
      );
    }
    const { data: ownedTags, error: ownedErr } = await db
      .from('tags')
      .select('id')
      .eq('account_id', accountId)
      .in('id', tagIds);
    if (ownedErr) {
      throw new BroadcastError('internal', 'Failed to resolve audience tags', 500);
    }
    const ownedIds = (ownedTags ?? []).map((t) => t.id as string);
    if (ownedIds.length === 0) return [];
    const { data: contactTags, error: tagError } = await db
      .from('contact_tags')
      .select('contact_id')
      .in('tag_id', ownedIds);
    if (tagError) {
      throw new BroadcastError('internal', 'Failed to resolve audience tags', 500);
    }
    const ids = [...new Set((contactTags ?? []).map((r) => r.contact_id as string))];
    return fetchContactsByIds(db, accountId, ids);
  }

  if (audience.type === 'group') {
    const groupIds = (audience.group_ids ?? []).filter((id) => typeof id === 'string');
    if (groupIds.length === 0) {
      throw new BroadcastError(
        'bad_request',
        "audience.type 'group' requires non-empty group_ids",
        400,
      );
    }
    const idSet = new Set<string>();
    for (const groupId of groupIds) {
      const { data, error } = await db.rpc('resolve_group_members', {
        p_group_id: groupId,
      });
      if (error) {
        throw new BroadcastError('internal', 'Failed to resolve group members', 500);
      }
      for (const row of data ?? []) {
        if (row.contact_id) idSet.add(row.contact_id);
      }
    }
    return fetchContactsByIds(db, accountId, [...idSet]);
  }

  throw new BroadcastError(
    'bad_request',
    "audience.type must be 'all', 'tags', or 'group'",
    400,
  );
}

async function fetchContactsByIds(
  db: SupabaseClient,
  accountId: string,
  ids: string[],
): Promise<{ id: string; phone: string | null; name: string | null; opted_out?: boolean }[]> {
  if (ids.length === 0) return [];
  const rows: { id: string; phone: string | null; name: string | null; opted_out?: boolean }[] =
    [];
  const PAGE = 500;
  for (let i = 0; i < ids.length; i += PAGE) {
    const { data, error } = await db
      .from('contacts')
      .select('id, phone, name, opted_out')
      .eq('account_id', accountId)
      .in('id', ids.slice(i, i + PAGE));
    if (error) {
      throw new BroadcastError('internal', 'Failed to fetch audience contacts', 500);
    }
    rows.push(...(data ?? []));
  }
  return filterMarketingEligible(
    db,
    accountId,
    rows.filter((c) => !c.opted_out),
    'whatsapp',
  );
}

/**
 * Persist a wwebjs plain-text broadcast and enqueue send_queue jobs
 * (same durable path as the dashboard composer).
 */
export async function createAndEnqueuePlainBroadcast(
  db: SupabaseClient,
  accountId: string,
  auditUserId: string,
  params: CreatePlainBroadcastParams,
): Promise<PlainBroadcastResult> {
  const body = params.body.trim();
  if (!body) {
    throw new BroadcastError('bad_request', "'body' is required for a plain-text broadcast", 400);
  }

  const explicitRecipients = Array.isArray(params.recipients) ? params.recipients : [];
  if (explicitRecipients.length === 0 && !params.audience) {
    throw new BroadcastError(
      'bad_request',
      "Provide 'recipients' (array of { to }) or 'audience' ({ type: all|tags|group })",
      400,
    );
  }

  if (!(await accountIsWwebjs(db, accountId))) {
    throw new BroadcastError(
      'bad_request',
      'Plain-text broadcasts require a connected WhatsApp Web (wwebjs) session. Use template_name for Cloud API.',
      400,
    );
  }

  const mediaUrl = params.mediaUrl?.trim() || undefined;
  const mediaKind: PlainMediaKind = params.mediaKind || 'image';

  let contactRows: { id: string; phone: string | null; name: string | null; opted_out?: boolean }[] =
    [];
  let rejected = 0;

  if (explicitRecipients.length > 0) {
    if (explicitRecipients.length > MAX_RECIPIENTS) {
      throw new BroadcastError(
        'bad_request',
        `A broadcast is capped at ${MAX_RECIPIENTS} recipients per request; split larger sends`,
        400,
      );
    }
    const resolved: { id: string; phone: string; name: string | null }[] = [];
    for (const r of explicitRecipients) {
      const sanitized = sanitizePhoneForMeta(typeof r.to === 'string' ? r.to : '');
      if (!isValidE164(sanitized)) {
        rejected++;
        continue;
      }
      const { id } = await findOrCreateContact(db, accountId, auditUserId, {
        phone: sanitized,
      });
      resolved.push({ id, phone: sanitized, name: sanitized });
    }
    const seen = new Set<string>();
    contactRows = resolved.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
    contactRows = await filterMarketingEligible(
      db,
      accountId,
      contactRows,
      'whatsapp',
    );
  } else if (params.audience) {
    contactRows = await resolveAudienceContacts(db, accountId, params.audience);
  }

  if (contactRows.length > MAX_RECIPIENTS) {
    throw new BroadcastError(
      'bad_request',
      `A broadcast is capped at ${MAX_RECIPIENTS} recipients per request; split larger sends`,
      400,
    );
  }
  if (contactRows.length === 0) {
    throw new BroadcastError('bad_request', NO_CONSENT_MESSAGE, 400);
  }

  const copyGate = reviewCopy(body);
  if (!copyGate.allow) {
    throw new BroadcastError(
      'bad_request',
      `Compliance blocked send: ${copyGate.violations.join(', ')}`,
      400,
    );
  }

  const { data: accountRow } = await db
    .from('accounts')
    .select('broadcast_jitter_min_sec, broadcast_jitter_max_sec')
    .eq('id', accountId)
    .maybeSingle();
  const jitter = normalizeJitterSeconds(
    accountRow?.broadcast_jitter_min_sec,
    accountRow?.broadcast_jitter_max_sec,
  );

  const { data: broadcast, error: bErr } = await db
    .from('broadcasts')
    .insert({
      account_id: accountId,
      user_id: auditUserId,
      name: params.name || 'API plain-text broadcast',
      template_name: 'plain_text',
      template_language: 'en',
      template_variables: {
        body,
        mediaUrl: mediaUrl ?? null,
        mediaKind,
      },
      audience_filter: params.audience ?? { type: 'recipients' },
      jitter_min_sec: jitter.minSec,
      jitter_max_sec: jitter.maxSec,
      status: 'sending',
      total_recipients: contactRows.length,
    })
    .select('id')
    .single();
  if (bErr || !broadcast) {
    console.error('[plain-broadcast] create error:', bErr);
    throw new BroadcastError('internal', 'Failed to create broadcast', 500);
  }

  const { data: recipientRows, error: rErr } = await db
    .from('broadcast_recipients')
    .insert(
      contactRows.map((c) => ({
        broadcast_id: broadcast.id,
        contact_id: c.id,
        status: 'pending' as const,
      })),
    )
    .select('id, contact_id');
  if (rErr || !recipientRows) {
    console.error('[plain-broadcast] recipients error:', rErr);
    throw new BroadcastError('internal', 'Failed to create broadcast', 500);
  }

  const byContact = new Map(contactRows.map((c) => [c.id, c]));
  const { jobs, queuedIds } = buildPlainSendJobs({
    accountId,
    broadcastId: broadcast.id,
    body,
    mediaUrl,
    mediaKind,
    jitterMinMs: jitter.minSec * 1000,
    jitterMaxMs: jitter.maxSec * 1000,
    recipients: recipientRows.map((row) => {
      const c = byContact.get(row.contact_id as string);
      return {
        id: row.id as string,
        contact_id: row.contact_id as string | null,
        contact: (c
          ? {
              id: c.id,
              phone: c.phone ?? '',
              name: c.name,
              opted_out: c.opted_out,
            }
          : null) as Contact | null,
      };
    }),
  });

  await insertSendQueueJobs(jobs);
  await markRecipientsQueued(queuedIds);

  return {
    broadcastId: broadcast.id,
    totalRecipients: jobs.length,
    rejected,
  };
}
