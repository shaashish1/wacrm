'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Contact, MessageTemplate } from '@/types';
import {
  resolveVariables,
  substitutePlainText,
  type VariableMapping,
} from '@/lib/broadcasts/personalize';

export type { VariableMapping };
export { resolveVariables, substitutePlainText };

export type CustomFieldOperator = 'is' | 'is_not' | 'contains';

export interface CustomFieldFilter {
  fieldId: string;
  operator: CustomFieldOperator;
  value: string;
}

export interface AudienceConfig {
  type: 'all' | 'tags' | 'custom_field' | 'csv' | 'group';
  tagIds?: string[];
  groupIds?: string[];
  customField?: CustomFieldFilter;
  csvContacts?: { phone: string; name?: string }[];
  /** Contacts carrying any of these tags are subtracted from the result. */
  excludeTagIds?: string[];
}

export interface PlainTextBroadcast {
  body: string;
  mediaUrl?: string;
  mediaKind?: 'image' | 'video' | 'document' | 'audio';
}

interface BroadcastPayload {
  name: string;
  template?: MessageTemplate | null;
  audience: AudienceConfig;
  variables: Record<string, VariableMapping>;
  /**
   * Media URL for an IMAGE/VIDEO/DOCUMENT header. Required at send
   * time for media-header templates — Meta rejects the send without
   * it. Passed through as `messageParams.headerMediaUrl`; the builder
   * falls back to the template's stored URL only when this is empty.
   */
  headerMediaUrl?: string;
  /** wwebjs plain-text path — mutually exclusive with `template`. */
  plainText?: PlainTextBroadcast;
  /** ISO datetime — when set in the future, persist as scheduled instead of sending. */
  scheduledAt?: string | null;
}

export type ProviderType = 'wwebjs' | 'cloud_api';

/**
 * Resolve the account's messaging provider. Falls back to a connected
 * wwebjs session if `accounts.provider_type` is missing.
 */
export async function resolveProviderType(
  accountId: string,
): Promise<ProviderType> {
  const supabase = createClient();
  const { data } = await supabase
    .from('accounts')
    .select('provider_type')
    .eq('id', accountId)
    .maybeSingle();
  if (data?.provider_type === 'wwebjs' || data?.provider_type === 'cloud_api') {
    return data.provider_type;
  }
  const { data: session } = await supabase
    .from('sessions')
    .select('provider_type')
    .eq('account_id', accountId)
    .maybeSingle();
  return session?.provider_type === 'wwebjs' ? 'wwebjs' : 'cloud_api';
}

interface UseBroadcastSendingReturn {
  createAndSendBroadcast: (payload: BroadcastPayload) => Promise<string>;
  isProcessing: boolean;
  progress: number;
}

/** `broadcast_recipients` inserts are independent of the send rate. */
const INSERT_BATCH_SIZE = 200;

/** contactId → (customFieldId → value). */
type CustomValueIndex = Map<string, Map<string, string>>;

/**
 * Bulk-fetch contact_custom_values for a set of contacts. Returns an
 * index keyed by contact_id → field_id → value.
 */
async function fetchCustomValueIndex(
  supabase: ReturnType<typeof createClient>,
  contactIds: string[],
): Promise<CustomValueIndex> {
  const index: CustomValueIndex = new Map();
  if (contactIds.length === 0) return index;

  // Supabase PostgREST caps the .in(...) IN-clause roughly at 1000
  // values. Page through to stay safe.
  const PAGE = 500;
  for (let i = 0; i < contactIds.length; i += PAGE) {
    const slice = contactIds.slice(i, i + PAGE);
    const { data } = await supabase
      .from('contact_custom_values')
      .select('contact_id, custom_field_id, value')
      .in('contact_id', slice);

    for (const row of data ?? []) {
      const bucket = index.get(row.contact_id) ?? new Map<string, string>();
      bucket.set(row.custom_field_id, row.value ?? '');
      index.set(row.contact_id, bucket);
    }
  }
  return index;
}

export function useBroadcastSending(): UseBroadcastSendingReturn {
  const { accountId } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  async function resolveAudience(audience: AudienceConfig): Promise<Contact[]> {
    const supabase = createClient();

    let contacts: Contact[] = [];

    if (audience.type === 'all') {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .or('opted_out.is.null,opted_out.eq.false');
      if (error) throw new Error(`Failed to fetch contacts: ${error.message}`);
      contacts = data ?? [];
    } else if (
      audience.type === 'tags' &&
      audience.tagIds &&
      audience.tagIds.length > 0
    ) {
      const { data: contactTags, error: tagError } = await supabase
        .from('contact_tags')
        .select('contact_id')
        .in('tag_id', audience.tagIds);

      if (tagError)
        throw new Error(`Failed to fetch contact tags: ${tagError.message}`);

      if (contactTags && contactTags.length > 0) {
        const uniqueContactIds = [
          ...new Set(contactTags.map((ct) => ct.contact_id)),
        ];
        const { data, error } = await supabase
          .from('contacts')
          .select('*')
          .in('id', uniqueContactIds);
        if (error) throw new Error(`Failed to fetch contacts: ${error.message}`);
        contacts = data ?? [];
      }
    } else if (audience.type === 'custom_field' && audience.customField) {
      contacts = await resolveCustomFieldAudience(supabase, audience.customField);
    } else if (audience.type === 'csv' && audience.csvContacts) {
      contacts = await upsertCsvContacts(supabase, audience.csvContacts);
    } else if (
      audience.type === 'group' &&
      audience.groupIds &&
      audience.groupIds.length > 0
    ) {
      const idSet = new Set<string>();
      for (const groupId of audience.groupIds) {
        const { data, error } = await supabase.rpc('resolve_group_members', {
          p_group_id: groupId,
        });
        if (error) {
          throw new Error(`Failed to resolve group members: ${error.message}`);
        }
        for (const row of data ?? []) {
          if (row.contact_id) idSet.add(row.contact_id);
        }
      }
      const ids = [...idSet];
      if (ids.length > 0) {
        const PAGE = 500;
        const rows: Contact[] = [];
        for (let i = 0; i < ids.length; i += PAGE) {
          const { data, error } = await supabase
            .from('contacts')
            .select('*')
            .in('id', ids.slice(i, i + PAGE));
          if (error) throw new Error(`Failed to fetch contacts: ${error.message}`);
          rows.push(...((data ?? []) as Contact[]));
        }
        contacts = rows;
      }
    }

    // Apply exclude tags (works across all contact-derived audience
    // types). CSV contacts are synthetic so exclusion doesn't apply.
    if (audience.excludeTagIds && audience.excludeTagIds.length > 0) {
      const { data: excludeRows } = await supabase
        .from('contact_tags')
        .select('contact_id')
        .in('tag_id', audience.excludeTagIds);
      const excludedIds = new Set((excludeRows ?? []).map((r) => r.contact_id));
      contacts = contacts.filter((c) => !excludedIds.has(c.id));
    }

    contacts = contacts.filter((c) => !c.opted_out);

    return contacts;
  }

  /**
   * CSV uploads arrive as raw phone/name pairs, not DB rows. Before we
   * can insert broadcast_recipients (whose contact_id FKs contacts.id),
   * we need real contacts.id UUIDs. So: look up each CSV phone in the
   * caller's contacts table; insert any that don't exist; return the
   * resolved set.
   *
   * Pre-existing implementation synthesized `csv-N` strings as
   * contact_id, which failed the UUID cast on insert — every CSV
   * broadcast silently created zero recipients.
   */
  async function upsertCsvContacts(
    supabase: ReturnType<typeof createClient>,
    csvRows: { phone: string; name?: string }[],
  ): Promise<Contact[]> {
    if (csvRows.length === 0) return [];

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      throw new Error('You are not signed in.');
    }
    if (!accountId) {
      throw new Error('Your profile is not linked to an account.');
    }

    // De-duplicate by phone within the CSV (users can paste duplicates).
    const uniqueByPhone = new Map<string, { phone: string; name?: string }>();
    for (const row of csvRows) {
      if (row.phone) uniqueByPhone.set(row.phone, row);
    }
    const phones = [...uniqueByPhone.keys()];

    // Single round-trip lookup of existing contacts by phone.
    const { data: existing, error: lookupErr } = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', user.id)
      .in('phone', phones);
    if (lookupErr) {
      throw new Error(`Failed to look up CSV contacts: ${lookupErr.message}`);
    }

    const byPhone = new Map<string, Contact>();
    for (const c of (existing ?? []) as Contact[]) {
      if (c.phone) byPhone.set(c.phone, c);
    }

    // Insert only missing contacts, in one batch per 200 rows (PostgREST
    // has a default payload cap — 200 keeps individual requests small).
    const missing = phones
      .filter((p) => !byPhone.has(p))
      .map((phone) => ({
        user_id: user.id,
        account_id: accountId,
        phone,
        name: uniqueByPhone.get(phone)?.name ?? null,
      }));

    const INSERT_CHUNK = 200;
    for (let i = 0; i < missing.length; i += INSERT_CHUNK) {
      const chunk = missing.slice(i, i + INSERT_CHUNK);
      const { data: inserted, error: insertErr } = await supabase
        .from('contacts')
        .insert(chunk)
        .select();
      if (insertErr) {
        throw new Error(`Failed to create CSV contacts: ${insertErr.message}`);
      }
      for (const c of (inserted ?? []) as Contact[]) {
        if (c.phone) byPhone.set(c.phone, c);
      }
    }

    // Preserve input order so analytics roughly matches the CSV order.
    return phones
      .map((p) => byPhone.get(p))
      .filter((c): c is Contact => Boolean(c));
  }

  async function resolveCustomFieldAudience(
    supabase: ReturnType<typeof createClient>,
    filter: CustomFieldFilter,
  ): Promise<Contact[]> {
    const { fieldId, operator, value } = filter;

    // Build the WHERE clause for the operator. PostgREST supports
    // eq/neq/ilike via the query builder — use ilike with wildcards
    // for "contains" so the match is case-insensitive.
    let query = supabase
      .from('contact_custom_values')
      .select('contact_id')
      .eq('custom_field_id', fieldId);

    if (operator === 'is') query = query.eq('value', value);
    else if (operator === 'is_not') query = query.neq('value', value);
    else if (operator === 'contains') query = query.ilike('value', `%${value}%`);

    const { data: matches, error: matchErr } = await query;
    if (matchErr)
      throw new Error(`Custom-field filter failed: ${matchErr.message}`);

    const contactIds = [...new Set((matches ?? []).map((m) => m.contact_id))];
    if (contactIds.length === 0) return [];

    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .in('id', contactIds);
    if (error) throw new Error(`Failed to fetch contacts: ${error.message}`);
    return data ?? [];
  }

  async function sendWwebjsBroadcast(
    supabase: ReturnType<typeof createClient>,
    payload: BroadcastPayload,
  ): Promise<string> {
    const body = payload.plainText?.body?.trim() ?? '';
    if (!body) {
      throw new Error('Message text is required.');
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      throw new Error('You are not signed in.');
    }
    if (!accountId) {
      throw new Error('Your profile is not linked to an account.');
    }

    setProgress(5);
    const contacts = await resolveAudience(payload.audience);
    if (contacts.length === 0) {
      throw new Error('No contacts found for this audience.');
    }

    const scheduledAt = payload.scheduledAt?.trim() || null;
    const isScheduled =
      Boolean(scheduledAt) && new Date(scheduledAt!).getTime() > Date.now();

    setProgress(10);
    const mediaUrl = payload.plainText?.mediaUrl?.trim() || undefined;
    const mediaKind = payload.plainText?.mediaKind ?? 'image';
    const audienceFilter = {
      type: payload.audience.type,
      tagIds: payload.audience.tagIds,
      groupIds: payload.audience.groupIds,
      customField: payload.audience.customField,
      excludeTagIds: payload.audience.excludeTagIds,
    };
    const { data: broadcast, error: broadcastError } = await supabase
      .from('broadcasts')
      .insert({
        user_id: user.id,
        account_id: accountId,
        name: payload.name,
        template_name: 'plain_text',
        template_language: 'en',
        template_variables: { body, mediaUrl: mediaUrl ?? null, mediaKind },
        audience_filter: audienceFilter,
        scheduled_at: isScheduled ? scheduledAt : null,
        status: isScheduled ? 'scheduled' : 'sending',
        total_recipients: contacts.length,
        sent_count: 0,
        delivered_count: 0,
        read_count: 0,
        replied_count: 0,
        failed_count: 0,
      })
      .select()
      .single();

    if (broadcastError || !broadcast) {
      throw new Error(
        `Failed to create broadcast: ${broadcastError?.message ?? 'unknown error'}`,
      );
    }

    setProgress(20);
    const recipientRows = contacts.map((contact) => ({
      broadcast_id: broadcast.id,
      contact_id: contact.id,
      status: 'pending' as const,
    }));

    for (let i = 0; i < recipientRows.length; i += INSERT_BATCH_SIZE) {
      const batch = recipientRows.slice(i, i + INSERT_BATCH_SIZE);
      const { error: recipientError } = await supabase
        .from('broadcast_recipients')
        .insert(batch);
      if (recipientError) {
        await supabase
          .from('broadcasts')
          .update({ status: 'failed', failed_count: contacts.length })
          .eq('id', broadcast.id);
        throw new Error(
          `Failed to insert recipient batch ${i / INSERT_BATCH_SIZE + 1}: ${recipientError.message}`,
        );
      }
    }

    setProgress(40);
    const { data: recipients, error: recipientsFetchError } = await supabase
      .from('broadcast_recipients')
      .select('*, contact:contacts(*)')
      .eq('broadcast_id', broadcast.id);

    if (recipientsFetchError || !recipients) {
      throw new Error('Failed to fetch broadcast recipients');
    }

    const apiRecipients = recipients
      .filter((r) => r.contact?.phone)
      .map((r) => ({
        phone: r.contact!.phone as string,
        body: substitutePlainText(body, r.contact as Contact),
        recipient_id: r.id as string,
        broadcast_id: broadcast.id as string,
        contact_id: r.contact_id as string | undefined,
        ...(mediaUrl ? { media: { url: mediaUrl, kind: mediaKind } } : {}),
      }));

    const missingPhone = recipients.filter((r) => !r.contact?.phone);
    for (const recipient of missingPhone) {
      await supabase
        .from('broadcast_recipients')
        .update({
          status: 'failed',
          error_message: 'No phone number on contact',
        })
        .eq('id', recipient.id);
    }

    if (apiRecipients.length === 0) {
      await supabase
        .from('broadcasts')
        .update({ status: 'failed' })
        .eq('id', broadcast.id);
      throw new Error('No recipients had a phone number.');
    }

    if (isScheduled) {
      setProgress(100);
      return broadcast.id;
    }

    setProgress(60);
    const res = await fetch('/api/whatsapp/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'plain',
        recipients: apiRecipients,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      await supabase
        .from('broadcasts')
        .update({ status: 'failed' })
        .eq('id', broadcast.id);
      throw new Error(data.error || 'Broadcast enqueue failed');
    }

    setProgress(100);
    return broadcast.id;
  }

  async function createAndSendBroadcast(payload: BroadcastPayload): Promise<string> {
    setIsProcessing(true);
    setProgress(0);

    const supabase = createClient();

    try {
      if (!accountId) {
        throw new Error('Your profile is not linked to an account.');
      }
      const providerType = await resolveProviderType(accountId);
      if (providerType === 'wwebjs' || payload.plainText) {
        return await sendWwebjsBroadcast(supabase, payload);
      }

      // ── Step 0: Resolve current user ──────────────────────────────
      // broadcasts.user_id is NOT NULL + guarded by RLS
      // (auth.uid() = user_id). Without this, the INSERT below was
      // silently failing with 23502 / 42501 — the wizard would
      // no-op with no feedback.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        throw new Error('You are not signed in.');
      }
      if (!accountId) {
        throw new Error('Your profile is not linked to an account.');
      }
      if (!payload.template) {
        throw new Error('A template is required for Cloud API broadcasts.');
      }

      // ── Step 1: Resolve audience contacts ─────────────────────────
      setProgress(5);
      const contacts = await resolveAudience(payload.audience);

      if (contacts.length === 0) {
        throw new Error('No contacts found for this audience.');
      }

      const scheduledAt = payload.scheduledAt?.trim() || null;
      const isScheduled =
        Boolean(scheduledAt) && new Date(scheduledAt!).getTime() > Date.now();

      // ── Step 2: Create broadcast row ──────────────────────────────
      setProgress(10);
      const { data: broadcast, error: broadcastError } = await supabase
        .from('broadcasts')
        .insert({
          user_id: user.id,
          account_id: accountId,
          name: payload.name,
          template_name: payload.template.name,
          template_language: payload.template.language ?? 'en_US',
          template_variables: payload.variables,
          audience_filter: {
            type: payload.audience.type,
            tagIds: payload.audience.tagIds,
            groupIds: payload.audience.groupIds,
            customField: payload.audience.customField,
            excludeTagIds: payload.audience.excludeTagIds,
            headerMediaUrl: payload.headerMediaUrl ?? null,
          },
          scheduled_at: isScheduled ? scheduledAt : null,
          status: isScheduled ? 'scheduled' : 'sending',
          total_recipients: contacts.length,
          sent_count: 0,
          delivered_count: 0,
          read_count: 0,
          replied_count: 0,
          failed_count: 0,
        })
        .select()
        .single();

      if (broadcastError || !broadcast) {
        throw new Error(
          `Failed to create broadcast: ${broadcastError?.message ?? 'unknown error'}`,
        );
      }

      // ── Step 3: Insert recipient rows ─────────────────────────────
      setProgress(20);
      const recipientRows = contacts.map((contact) => ({
        broadcast_id: broadcast.id,
        contact_id: contact.id,
        status: 'pending' as const,
      }));

      for (let i = 0; i < recipientRows.length; i += INSERT_BATCH_SIZE) {
        const batch = recipientRows.slice(i, i + INSERT_BATCH_SIZE);
        const { error: recipientError } = await supabase
          .from('broadcast_recipients')
          .insert(batch);
        if (recipientError) {
          // Previous impl logged and marched on — the broadcast then ran
          // with an incomplete recipient set, so webhook status updates
          // couldn't find some rows and the aggregate counts drifted.
          // Flip the broadcast to failed so the user sees the problem
          // immediately, then throw to abort the send loop.
          await supabase
            .from('broadcasts')
            .update({
              status: 'failed',
              failed_count: contacts.length,
            })
            .eq('id', broadcast.id);
          throw new Error(
            `Failed to insert recipient batch ${i / INSERT_BATCH_SIZE + 1}: ${recipientError.message}`,
          );
        }
      }

      // ── Step 4: Fetch recipients (joined contact) + preload custom values
      setProgress(30);
      const { data: recipients, error: recipientsFetchError } = await supabase
        .from('broadcast_recipients')
        .select('*, contact:contacts(*)')
        .eq('broadcast_id', broadcast.id);

      if (recipientsFetchError || !recipients) {
        throw new Error('Failed to fetch broadcast recipients');
      }

      // One bulk fetch of custom values for every contact in this
      // broadcast, avoiding N+1 during the send loop.
      const contactIds = recipients
        .map((r) => r.contact?.id)
        .filter((id): id is string => Boolean(id));
      const customValueIndex = await fetchCustomValueIndex(
        supabase,
        contactIds,
      );

      const headerType = payload.template.header_type;
      const isMediaHeader =
        headerType === 'image' ||
        headerType === 'video' ||
        headerType === 'document';
      const headerMediaUrl = payload.headerMediaUrl?.trim();
      const messageParams =
        isMediaHeader && headerMediaUrl ? { headerMediaUrl } : undefined;

      if (isScheduled) {
        setProgress(100);
        return broadcast.id;
      }

      const apiRecipients = recipients
        .filter((r) => r.contact?.phone)
        .map((r) => ({
          phone: r.contact!.phone as string,
          params: r.contact
            ? resolveVariables(
                payload.variables,
                r.contact,
                customValueIndex.get(r.contact.id),
              )
            : [],
          recipient_id: r.id as string,
          broadcast_id: broadcast.id as string,
          contact_id: r.contact_id as string | undefined,
          ...(messageParams ? { messageParams } : {}),
        }));

      for (const recipient of recipients.filter((r) => !r.contact?.phone)) {
        await supabase
          .from('broadcast_recipients')
          .update({
            status: 'failed',
            error_message: 'No phone number on contact',
          })
          .eq('id', recipient.id);
      }

      if (apiRecipients.length === 0) {
        await supabase
          .from('broadcasts')
          .update({ status: 'failed' })
          .eq('id', broadcast.id);
        throw new Error('No recipients had a phone number.');
      }

      setProgress(70);
      const res = await fetch('/api/whatsapp/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: apiRecipients,
          template_name: payload.template.name,
          template_language: payload.template.language ?? 'en_US',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        await supabase
          .from('broadcasts')
          .update({ status: 'failed' })
          .eq('id', broadcast.id);
        throw new Error(data.error || 'Broadcast enqueue failed');
      }

      setProgress(100);
      return broadcast.id;
    } finally {
      setIsProcessing(false);
    }
  }

  return { createAndSendBroadcast, isProcessing, progress };
}
