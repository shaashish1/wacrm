// ============================================================
// Public-API campaign serializers + consent-gated enroll.
//
// Enroll never sends WhatsApp. It only writes enrollment rows; the
// existing campaign cron (`/api/campaigns/cron`) is the consented
// queue path and re-checks consent at fire time. Importing a group
// is not consent — candidates without an active ledger row are
// skipped, and an empty eligible set is refused.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  loadMarketingEligibleIds,
  NO_CONSENT_MESSAGE,
  type MarketingChannel,
} from '@/lib/consent';

export const ENROLL_MAX = 1000;

export const CAMPAIGN_CHANNELS = ['email', 'whatsapp', 'multi'] as const;
export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

export const AUDIENCE_TYPES = ['group', 'filter', 'manual'] as const;
export const TRIGGER_TYPES = ['manual', 'pipeline_stage', 'event'] as const;

export const CAMPAIGN_SELECT =
  'id, name, channel, status, audience_type, audience_group_id, audience_filter, trigger_type, trigger_config, created_at, updated_at';

export const CAMPAIGN_STEP_SELECT =
  'id, campaign_id, position, channel, email_template_id, whatsapp_template_name, delay_hours, exit_on_reply, exit_on_stage_change, created_at';

export const CAMPAIGN_DETAIL_SELECT = `${CAMPAIGN_SELECT}, campaign_steps(${CAMPAIGN_STEP_SELECT}), campaign_enrollments(count)`;

export const ENROLLMENT_SELECT =
  'id, campaign_id, contact_id, current_step, status, next_send_at, enrolled_at, completed_at';

export interface ApiCampaignStep {
  id: string;
  position: number;
  channel: string;
  delay_hours: number;
  email_template_id: string | null;
  whatsapp_template_name: string | null;
  exit_on_reply: boolean;
}

export interface ApiCampaign {
  id: string;
  name: string;
  channel: string;
  status: string;
  audience_type: string | null;
  audience_group_id: string | null;
  trigger_type: string | null;
  enrollment_count: number;
  step_count: number;
  created_at: string;
  updated_at: string | null;
  steps?: ApiCampaignStep[];
}

export interface ApiEnrollment {
  id: string;
  campaign_id: string;
  contact_id: string;
  current_step: number;
  status: string;
  next_send_at: string | null;
  enrolled_at: string | null;
  completed_at: string | null;
}

export interface EnrollDecision {
  toEnroll: string[];
  skippedNoConsent: string[];
  alreadyEnrolled: string[];
}

export type EnrollResult =
  | {
      ok: true;
      enrolled: number;
      skipped_no_consent: number;
      already_enrolled: number;
      campaign_status: string;
    }
  | { ok: false; code: 'not_found' | 'bad_request' | 'no_consent'; message: string };

const TERMINAL_STATUSES = new Set(['completed', 'archived']);

export function serializeCampaignStep(
  row: Record<string, unknown>
): ApiCampaignStep {
  return {
    id: row.id as string,
    position: typeof row.position === 'number' ? row.position : 0,
    channel: (row.channel as string) ?? 'email',
    delay_hours: typeof row.delay_hours === 'number' ? row.delay_hours : 0,
    email_template_id: (row.email_template_id as string | null) ?? null,
    whatsapp_template_name:
      (row.whatsapp_template_name as string | null) ?? null,
    exit_on_reply: row.exit_on_reply !== false,
  };
}

export function serializeCampaign(
  row: Record<string, unknown>,
  opts?: { enrollmentCount?: number; includeSteps?: boolean }
): ApiCampaign {
  const stepsRaw = row.campaign_steps as Array<Record<string, unknown>> | undefined;
  const enrollEmbed = row.campaign_enrollments as
    | Array<{ count?: number }>
    | undefined;
  const enrollmentCount =
    opts?.enrollmentCount ??
    (typeof enrollEmbed?.[0]?.count === 'number' ? enrollEmbed[0].count : 0);
  const steps = (stepsRaw ?? [])
    .slice()
    .sort(
      (a, b) =>
        (typeof a.position === 'number' ? a.position : 0) -
        (typeof b.position === 'number' ? b.position : 0)
    )
    .map(serializeCampaignStep);

  const out: ApiCampaign = {
    id: row.id as string,
    name: row.name as string,
    channel: (row.channel as string) ?? 'email',
    status: (row.status as string) ?? 'draft',
    audience_type: (row.audience_type as string | null) ?? null,
    audience_group_id: (row.audience_group_id as string | null) ?? null,
    trigger_type: (row.trigger_type as string | null) ?? null,
    enrollment_count: enrollmentCount,
    step_count: steps.length,
    created_at: row.created_at as string,
    updated_at: (row.updated_at as string | null) ?? null,
  };
  if (opts?.includeSteps) out.steps = steps;
  return out;
}

export function serializeEnrollment(
  row: Record<string, unknown>
): ApiEnrollment {
  return {
    id: row.id as string,
    campaign_id: row.campaign_id as string,
    contact_id: row.contact_id as string,
    current_step: typeof row.current_step === 'number' ? row.current_step : 0,
    status: row.status as string,
    next_send_at: (row.next_send_at as string | null) ?? null,
    enrolled_at: (row.enrolled_at as string | null) ?? null,
    completed_at: (row.completed_at as string | null) ?? null,
  };
}

/**
 * Channel used for the enroll consent gate. WhatsApp is the blast-
 * risk path: a `multi` campaign with any WA step (or no steps yet)
 * requires WhatsApp consent. Email-only campaigns use email consent.
 */
export function campaignMarketingChannel(
  channel: string,
  steps?: Array<{ channel?: string | null }>
): MarketingChannel {
  if (channel === 'email') return 'email';
  if (channel === 'whatsapp') return 'whatsapp';
  const hasWa = (steps ?? []).some((s) => s.channel === 'whatsapp');
  const hasEmail = (steps ?? []).some((s) => s.channel === 'email');
  if (hasWa) return 'whatsapp';
  if (hasEmail) return 'email';
  return 'whatsapp';
}

export function decideCampaignEnroll(
  candidateIds: string[],
  eligibleIds: Set<string>,
  alreadyEnrolledIds: Set<string>
): EnrollDecision {
  const toEnroll: string[] = [];
  const skippedNoConsent: string[] = [];
  const alreadyEnrolled: string[] = [];
  const seen = new Set<string>();
  for (const id of candidateIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (alreadyEnrolledIds.has(id)) {
      alreadyEnrolled.push(id);
      continue;
    }
    if (!eligibleIds.has(id)) {
      skippedNoConsent.push(id);
      continue;
    }
    toEnroll.push(id);
  }
  return { toEnroll, skippedNoConsent, alreadyEnrolled };
}

/** True when nobody new can enroll and nobody is already in — refuse. */
export function enrollRefused(decision: EnrollDecision): boolean {
  return decision.toEnroll.length === 0 && decision.alreadyEnrolled.length === 0;
}

export function parseEnrollContactIds(body: unknown): string[] | null {
  if (!body || typeof body !== 'object') return [];
  const raw = (body as { contact_ids?: unknown }).contact_ids;
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

export interface ParsedCampaignStep {
  position: number;
  channel: 'email' | 'whatsapp';
  delay_hours: number;
  email_template_id: string | null;
  whatsapp_template_name: string | null;
  exit_on_reply: boolean;
}

export interface ParsedCampaignCreate {
  name: string;
  channel: CampaignChannel;
  audience_type: string;
  audience_group_id: string | null;
  audience_filter: unknown | null;
  trigger_type: string;
  trigger_config: unknown | null;
  steps: ParsedCampaignStep[];
}

export interface ParsedCampaignUpdate {
  name?: string;
  channel?: CampaignChannel;
  audience_type?: string;
  audience_group_id?: string | null;
  audience_filter?: unknown | null;
  trigger_type?: string;
  trigger_config?: unknown | null;
  steps?: ParsedCampaignStep[];
}

export interface ResumeDecision {
  toResume: string[];
  skippedNoConsent: string[];
}

export function parseCampaignChannel(value: unknown): CampaignChannel | null {
  if (value === undefined || value === null) return 'email';
  if (
    typeof value === 'string' &&
    (CAMPAIGN_CHANNELS as readonly string[]).includes(value)
  ) {
    return value as CampaignChannel;
  }
  return null;
}

function parseOptionalEnum(
  value: unknown,
  allowed: readonly string[],
  fallback: string
): string | null {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string' && allowed.includes(value)) return value;
  return null;
}

export function parseCampaignSteps(raw: unknown): ParsedCampaignStep[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ParsedCampaignStep[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== 'object') return null;
    const rec = item as Record<string, unknown>;
    let channel: 'email' | 'whatsapp';
    if (rec.channel === 'whatsapp') channel = 'whatsapp';
    else if (rec.channel === 'email' || rec.channel === undefined) {
      channel = 'email';
    } else {
      return null;
    }
    const delayRaw = rec.delay_hours;
    const delayHours =
      typeof delayRaw === 'number' && Number.isFinite(delayRaw)
        ? Math.max(0, delayRaw)
        : Number(delayRaw) || 0;
    const emailId =
      typeof rec.email_template_id === 'string' && rec.email_template_id
        ? rec.email_template_id
        : null;
    const waName =
      typeof rec.whatsapp_template_name === 'string'
        ? rec.whatsapp_template_name
        : typeof rec.body_text === 'string'
          ? rec.body_text
          : null;
    out.push({
      position: typeof rec.position === 'number' ? rec.position : i + 1,
      channel,
      delay_hours: delayHours,
      email_template_id: emailId,
      whatsapp_template_name: waName,
      exit_on_reply: rec.exit_on_reply !== false,
    });
  }
  return out;
}

/**
 * Create never enrolls and never sends. Status is always draft —
 * `active` on the body is refused so this cannot imply a blast of
 * the imported book. `contact_ids` belongs on `/enroll`.
 */
export function parseCampaignCreate(
  body: unknown
):
  | { ok: true; value: ParsedCampaignCreate }
  | { ok: false; message: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, message: 'Request body must be a JSON object' };
  }
  const rec = body as Record<string, unknown>;
  if ('contact_ids' in rec) {
    return {
      ok: false,
      message:
        'Create does not enroll contacts. Use POST /api/v1/campaigns/{id}/enroll after consent.',
    };
  }
  if (
    'status' in rec &&
    rec.status !== undefined &&
    rec.status !== null &&
    rec.status !== 'draft'
  ) {
    return {
      ok: false,
      message:
        'Create always starts as draft and does not send. Enroll consented contacts; cron is the send path.',
    };
  }
  const name = typeof rec.name === 'string' ? rec.name.trim() : '';
  if (!name) return { ok: false, message: "'name' is required" };

  const channel = parseCampaignChannel(rec.channel);
  if (channel === null) {
    return {
      ok: false,
      message: "'channel' must be email, whatsapp, or multi",
    };
  }
  const audienceType = parseOptionalEnum(
    rec.audience_type,
    AUDIENCE_TYPES,
    'group'
  );
  if (audienceType === null) {
    return {
      ok: false,
      message: "'audience_type' must be group, filter, or manual",
    };
  }
  const triggerType = parseOptionalEnum(
    rec.trigger_type,
    TRIGGER_TYPES,
    'manual'
  );
  if (triggerType === null) {
    return {
      ok: false,
      message: "'trigger_type' must be manual, pipeline_stage, or event",
    };
  }

  let steps: ParsedCampaignStep[] = [];
  if (rec.steps !== undefined) {
    const parsed = parseCampaignSteps(rec.steps);
    if (parsed === null) {
      return {
        ok: false,
        message:
          "'steps' must be an array of { channel, delay_hours?, email_template_id?, whatsapp_template_name? }",
      };
    }
    steps = parsed;
  }

  const audienceGroupId =
    typeof rec.audience_group_id === 'string' && rec.audience_group_id
      ? rec.audience_group_id
      : rec.audience_group_id === null
        ? null
        : null;

  return {
    ok: true,
    value: {
      name,
      channel,
      audience_type: audienceType,
      audience_group_id: audienceGroupId,
      audience_filter:
        rec.audience_filter && typeof rec.audience_filter === 'object'
          ? rec.audience_filter
          : null,
      trigger_type: triggerType,
      trigger_config:
        rec.trigger_config && typeof rec.trigger_config === 'object'
          ? rec.trigger_config
          : null,
      steps,
    },
  };
}

/**
 * Update edits metadata / steps only. Status changes go through
 * pause / resume. Does not enroll and does not send.
 */
export function parseCampaignUpdate(
  body: unknown
):
  | { ok: true; value: ParsedCampaignUpdate }
  | { ok: false; message: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, message: 'Request body must be a JSON object' };
  }
  const rec = body as Record<string, unknown>;
  if ('contact_ids' in rec) {
    return {
      ok: false,
      message:
        'Update does not enroll contacts. Use POST /api/v1/campaigns/{id}/enroll.',
    };
  }
  if ('status' in rec) {
    return {
      ok: false,
      message:
        'Do not set status here. Use POST /api/v1/campaigns/{id}/pause or /resume.',
    };
  }

  const value: ParsedCampaignUpdate = {};
  if ('name' in rec) {
    if (typeof rec.name !== 'string' || !rec.name.trim()) {
      return { ok: false, message: "'name' must be a non-empty string" };
    }
    value.name = rec.name.trim();
  }
  if ('channel' in rec) {
    const channel = parseCampaignChannel(rec.channel);
    if (channel === null || rec.channel === undefined || rec.channel === null) {
      return {
        ok: false,
        message: "'channel' must be email, whatsapp, or multi",
      };
    }
    value.channel = channel;
  }
  if ('audience_type' in rec) {
    const audienceType = parseOptionalEnum(
      rec.audience_type,
      AUDIENCE_TYPES,
      ''
    );
    if (!audienceType) {
      return {
        ok: false,
        message: "'audience_type' must be group, filter, or manual",
      };
    }
    value.audience_type = audienceType;
  }
  if ('audience_group_id' in rec) {
    if (rec.audience_group_id === null) {
      value.audience_group_id = null;
    } else if (
      typeof rec.audience_group_id === 'string' &&
      rec.audience_group_id
    ) {
      value.audience_group_id = rec.audience_group_id;
    } else {
      return {
        ok: false,
        message: "'audience_group_id' must be a string or null",
      };
    }
  }
  if ('audience_filter' in rec) {
    value.audience_filter =
      rec.audience_filter && typeof rec.audience_filter === 'object'
        ? rec.audience_filter
        : null;
  }
  if ('trigger_type' in rec) {
    const triggerType = parseOptionalEnum(rec.trigger_type, TRIGGER_TYPES, '');
    if (!triggerType) {
      return {
        ok: false,
        message: "'trigger_type' must be manual, pipeline_stage, or event",
      };
    }
    value.trigger_type = triggerType;
  }
  if ('trigger_config' in rec) {
    value.trigger_config =
      rec.trigger_config && typeof rec.trigger_config === 'object'
        ? rec.trigger_config
        : null;
  }
  if ('steps' in rec) {
    const parsed = parseCampaignSteps(rec.steps);
    if (parsed === null) {
      return {
        ok: false,
        message:
          "'steps' must be an array of { channel, delay_hours?, email_template_id?, whatsapp_template_name? }",
      };
    }
    value.steps = parsed;
  }

  if (Object.keys(value).length === 0) {
    return { ok: false, message: 'No updatable fields provided' };
  }
  return { ok: true, value };
}

export function decideCampaignResume(
  pausedContactIds: string[],
  eligibleIds: Set<string>
): ResumeDecision {
  const toResume: string[] = [];
  const skippedNoConsent: string[] = [];
  const seen = new Set<string>();
  for (const id of pausedContactIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (eligibleIds.has(id)) toResume.push(id);
    else skippedNoConsent.push(id);
  }
  return { toResume, skippedNoConsent };
}

/** Paused campaign with nobody eligible to return to cron. */
export function resumeRefused(
  campaignStatus: string,
  decision: ResumeDecision,
  pausedCount: number
): boolean {
  if (decision.toResume.length > 0) return false;
  if (campaignStatus === 'paused') return true;
  return pausedCount > 0;
}

async function assertAudienceGroup(
  db: SupabaseClient,
  accountId: string,
  groupId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data, error } = await db
    .from('contact_groups')
    .select('id')
    .eq('id', groupId)
    .eq('account_id', accountId)
    .maybeSingle();
  if (error) {
    console.error('[campaigns] audience group error:', error);
    return { ok: false, message: 'Failed to verify audience group' };
  }
  if (!data) {
    return { ok: false, message: 'audience_group_id is not in this account' };
  }
  return { ok: true };
}

async function loadCampaignDetail(
  db: SupabaseClient,
  accountId: string,
  campaignId: string
) {
  return db
    .from('campaigns')
    .select(CAMPAIGN_DETAIL_SELECT)
    .eq('id', campaignId)
    .eq('account_id', accountId)
    .maybeSingle();
}

export async function createCampaign(
  db: SupabaseClient,
  opts: { accountId: string; body: unknown }
): Promise<
  | { ok: true; campaign: ApiCampaign }
  | { ok: false; code: 'bad_request' | 'internal'; message: string }
> {
  const parsed = parseCampaignCreate(opts.body);
  if (!parsed.ok) return { ok: false, code: 'bad_request', message: parsed.message };

  if (parsed.value.audience_group_id) {
    const group = await assertAudienceGroup(
      db,
      opts.accountId,
      parsed.value.audience_group_id
    );
    if (!group.ok) return { ok: false, code: 'bad_request', message: group.message };
  }

  const { data, error } = await db
    .from('campaigns')
    .insert({
      account_id: opts.accountId,
      name: parsed.value.name,
      channel: parsed.value.channel,
      status: 'draft',
      audience_type: parsed.value.audience_type,
      audience_group_id: parsed.value.audience_group_id,
      audience_filter: parsed.value.audience_filter,
      trigger_type: parsed.value.trigger_type,
      trigger_config: parsed.value.trigger_config,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[campaigns] create error:', error);
    return { ok: false, code: 'internal', message: 'Failed to create campaign' };
  }

  if (parsed.value.steps.length > 0) {
    const { error: stepsErr } = await db.from('campaign_steps').insert(
      parsed.value.steps.map((s) => ({
        campaign_id: data.id,
        position: s.position,
        channel: s.channel,
        delay_hours: s.delay_hours,
        email_template_id: s.email_template_id,
        whatsapp_template_name: s.whatsapp_template_name,
        exit_on_reply: s.exit_on_reply,
      }))
    );
    if (stepsErr) {
      console.error('[campaigns] create steps error:', stepsErr);
      return { ok: false, code: 'internal', message: 'Failed to create campaign steps' };
    }
  }

  const { data: full, error: loadErr } = await loadCampaignDetail(
    db,
    opts.accountId,
    data.id
  );
  if (loadErr || !full) {
    console.error('[campaigns] create reload error:', loadErr);
    return { ok: false, code: 'internal', message: 'Failed to load created campaign' };
  }

  return {
    ok: true,
    campaign: serializeCampaign(full as Record<string, unknown>, {
      includeSteps: true,
    }),
  };
}

export async function updateCampaign(
  db: SupabaseClient,
  opts: { accountId: string; campaignId: string; body: unknown }
): Promise<
  | { ok: true; campaign: ApiCampaign }
  | {
      ok: false;
      code: 'bad_request' | 'not_found' | 'internal';
      message: string;
    }
> {
  const parsed = parseCampaignUpdate(opts.body);
  if (!parsed.ok) return { ok: false, code: 'bad_request', message: parsed.message };

  const { data: existing, error: loadErr } = await db
    .from('campaigns')
    .select('id, status')
    .eq('id', opts.campaignId)
    .eq('account_id', opts.accountId)
    .maybeSingle();
  if (loadErr) {
    console.error('[campaigns] update load error:', loadErr);
    return { ok: false, code: 'internal', message: 'Failed to load campaign' };
  }
  if (!existing) {
    return { ok: false, code: 'not_found', message: 'Campaign not found' };
  }
  if (TERMINAL_STATUSES.has(existing.status as string)) {
    return {
      ok: false,
      code: 'bad_request',
      message: 'Campaign is completed or archived',
    };
  }

  if (parsed.value.audience_group_id) {
    const group = await assertAudienceGroup(
      db,
      opts.accountId,
      parsed.value.audience_group_id
    );
    if (!group.ok) return { ok: false, code: 'bad_request', message: group.message };
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (parsed.value.name !== undefined) updates.name = parsed.value.name;
  if (parsed.value.channel !== undefined) updates.channel = parsed.value.channel;
  if (parsed.value.audience_type !== undefined) {
    updates.audience_type = parsed.value.audience_type;
  }
  if (parsed.value.audience_group_id !== undefined) {
    updates.audience_group_id = parsed.value.audience_group_id;
  }
  if (parsed.value.audience_filter !== undefined) {
    updates.audience_filter = parsed.value.audience_filter;
  }
  if (parsed.value.trigger_type !== undefined) {
    updates.trigger_type = parsed.value.trigger_type;
  }
  if (parsed.value.trigger_config !== undefined) {
    updates.trigger_config = parsed.value.trigger_config;
  }

  const { error: upErr } = await db
    .from('campaigns')
    .update(updates)
    .eq('id', opts.campaignId)
    .eq('account_id', opts.accountId);
  if (upErr) {
    console.error('[campaigns] update error:', upErr);
    return { ok: false, code: 'internal', message: 'Failed to update campaign' };
  }

  if (parsed.value.steps) {
    const { error: delErr } = await db
      .from('campaign_steps')
      .delete()
      .eq('campaign_id', opts.campaignId);
    if (delErr) {
      console.error('[campaigns] replace steps delete error:', delErr);
      return { ok: false, code: 'internal', message: 'Failed to update campaign steps' };
    }
    if (parsed.value.steps.length > 0) {
      const { error: stepsErr } = await db.from('campaign_steps').insert(
        parsed.value.steps.map((s) => ({
          campaign_id: opts.campaignId,
          position: s.position,
          channel: s.channel,
          delay_hours: s.delay_hours,
          email_template_id: s.email_template_id,
          whatsapp_template_name: s.whatsapp_template_name,
          exit_on_reply: s.exit_on_reply,
        }))
      );
      if (stepsErr) {
        console.error('[campaigns] replace steps insert error:', stepsErr);
        return {
          ok: false,
          code: 'internal',
          message: 'Failed to update campaign steps',
        };
      }
    }
  }

  const { data: full, error: reloadErr } = await loadCampaignDetail(
    db,
    opts.accountId,
    opts.campaignId
  );
  if (reloadErr || !full) {
    console.error('[campaigns] update reload error:', reloadErr);
    return { ok: false, code: 'internal', message: 'Failed to load updated campaign' };
  }

  return {
    ok: true,
    campaign: serializeCampaign(full as Record<string, unknown>, {
      includeSteps: true,
    }),
  };
}

/**
 * Return paused enrollments to the campaign cron. Does not send
 * WhatsApp — cron is the consented queue path and re-checks consent
 * at fire time. Contacts without an active consent row stay paused.
 */
export async function resumeCampaign(
  db: SupabaseClient,
  accountId: string,
  campaignId: string
): Promise<
  | {
      ok: true;
      status: 'active';
      resumed: number;
      skipped_no_consent: number;
      campaign_status: string;
    }
  | {
      ok: false;
      code: 'not_found' | 'bad_request' | 'no_consent';
      message: string;
    }
> {
  const { data: campaign, error } = await db
    .from('campaigns')
    .select(`${CAMPAIGN_SELECT}, campaign_steps(id, channel)`)
    .eq('id', campaignId)
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) {
    console.error('[campaigns] resume load error:', error);
    return { ok: false, code: 'bad_request', message: 'Failed to load campaign' };
  }
  if (!campaign) {
    return { ok: false, code: 'not_found', message: 'Campaign not found' };
  }

  const status = (campaign.status as string) ?? 'draft';
  if (TERMINAL_STATUSES.has(status)) {
    return {
      ok: false,
      code: 'bad_request',
      message: 'Campaign is completed or archived',
    };
  }
  if (status === 'draft') {
    return {
      ok: false,
      code: 'bad_request',
      message:
        'Campaign is still a draft. Enroll consented contacts to start; resume does not send.',
    };
  }

  const { data: paused, error: pausedErr } = await db
    .from('campaign_enrollments')
    .select('contact_id')
    .eq('campaign_id', campaignId)
    .eq('status', 'paused');
  if (pausedErr) {
    console.error('[campaigns] resume enrollments error:', pausedErr);
    return {
      ok: false,
      code: 'bad_request',
      message: 'Failed to load enrollments',
    };
  }

  const pausedIds = (paused ?? []).map((r) => r.contact_id as string);
  const steps = (campaign.campaign_steps as Array<{ channel?: string }>) ?? [];
  const channel = campaignMarketingChannel(campaign.channel as string, steps);
  const eligible =
    pausedIds.length > 0
      ? await loadMarketingEligibleIds(db, accountId, pausedIds, channel)
      : new Set<string>();

  const decision = decideCampaignResume(pausedIds, eligible);
  if (resumeRefused(status, decision, pausedIds.length)) {
    return { ok: false, code: 'no_consent', message: NO_CONSENT_MESSAGE };
  }

  if (decision.toResume.length > 0) {
    const { error: thawErr } = await db
      .from('campaign_enrollments')
      .update({
        status: 'active',
        next_send_at: new Date().toISOString(),
      })
      .eq('campaign_id', campaignId)
      .eq('status', 'paused')
      .in('contact_id', decision.toResume);
    if (thawErr) {
      console.error('[campaigns] resume thaw error:', thawErr);
      return {
        ok: false,
        code: 'bad_request',
        message: 'Failed to resume enrollments',
      };
    }
  }

  let nextStatus = status;
  if (status === 'paused') {
    const { error: upErr } = await db
      .from('campaigns')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', campaignId)
      .eq('account_id', accountId);
    if (upErr) {
      console.error('[campaigns] resume update error:', upErr);
      return {
        ok: false,
        code: 'bad_request',
        message: 'Failed to resume campaign',
      };
    }
    nextStatus = 'active';
  }

  return {
    ok: true,
    status: 'active',
    resumed: decision.toResume.length,
    skipped_no_consent: decision.skippedNoConsent.length,
    campaign_status: nextStatus,
  };
}

export async function enrollCampaignContacts(
  db: SupabaseClient,
  opts: {
    accountId: string;
    campaignId: string;
    contactIds?: string[] | null;
  }
): Promise<EnrollResult> {
  const { data: campaign, error: cErr } = await db
    .from('campaigns')
    .select(
      `${CAMPAIGN_SELECT}, campaign_steps(id, channel)`
    )
    .eq('id', opts.campaignId)
    .eq('account_id', opts.accountId)
    .maybeSingle();

  if (cErr) {
    console.error('[campaigns] load error:', cErr);
    return { ok: false, code: 'bad_request', message: 'Failed to load campaign' };
  }
  if (!campaign) {
    return { ok: false, code: 'not_found', message: 'Campaign not found' };
  }

  const status = (campaign.status as string) ?? 'draft';
  if (TERMINAL_STATUSES.has(status)) {
    return {
      ok: false,
      code: 'bad_request',
      message: 'Campaign is completed or archived',
    };
  }

  let candidateIds = (opts.contactIds ?? []).filter(Boolean);
  if (candidateIds.length === 0) {
    if (campaign.audience_type !== 'group' || !campaign.audience_group_id) {
      return {
        ok: false,
        code: 'bad_request',
        message:
          "Provide contact_ids, or set the campaign audience to a contact group",
      };
    }
    const { data: members, error: mErr } = await db.rpc('resolve_group_members', {
      p_group_id: campaign.audience_group_id,
    });
    if (mErr) {
      console.error('[campaigns] resolve audience error:', mErr);
      return { ok: false, code: 'bad_request', message: 'Failed to resolve audience' };
    }
    candidateIds = (members ?? []).map(
      (m: { contact_id: string }) => m.contact_id
    );
  }

  if (candidateIds.length === 0) {
    return {
      ok: false,
      code: 'bad_request',
      message: 'No contacts in audience to enroll',
    };
  }
  if (candidateIds.length > ENROLL_MAX) {
    return {
      ok: false,
      code: 'bad_request',
      message: `At most ${ENROLL_MAX} contacts per enroll request`,
    };
  }

  const { data: owned, error: ownedErr } = await db
    .from('contacts')
    .select('id')
    .eq('account_id', opts.accountId)
    .in('id', candidateIds);
  if (ownedErr) {
    console.error('[campaigns] contact ownership error:', ownedErr);
    return { ok: false, code: 'bad_request', message: 'Failed to verify contacts' };
  }
  const ownedSet = new Set((owned ?? []).map((r) => r.id as string));
  const inAccount = candidateIds.filter((id) => ownedSet.has(id));
  if (inAccount.length === 0) {
    return {
      ok: false,
      code: 'bad_request',
      message: 'No contacts in this account match the given ids',
    };
  }

  const steps = (campaign.campaign_steps as Array<{ channel?: string }>) ?? [];
  const channel = campaignMarketingChannel(campaign.channel as string, steps);
  const eligible = await loadMarketingEligibleIds(
    db,
    opts.accountId,
    inAccount,
    channel
  );

  const { data: existing, error: existErr } = await db
    .from('campaign_enrollments')
    .select('contact_id')
    .eq('campaign_id', opts.campaignId)
    .in('contact_id', inAccount);
  if (existErr) {
    console.error('[campaigns] existing enrollments error:', existErr);
    return { ok: false, code: 'bad_request', message: 'Failed to load enrollments' };
  }
  const already = new Set((existing ?? []).map((r) => r.contact_id as string));

  const decision = decideCampaignEnroll(inAccount, eligible, already);
  if (enrollRefused(decision)) {
    return { ok: false, code: 'no_consent', message: NO_CONSENT_MESSAGE };
  }

  const becomeActive = status === 'draft' || status === 'active';
  const nextSendAt = becomeActive ? new Date().toISOString() : null;
  const enrollmentStatus = becomeActive ? 'active' : 'paused';

  if (decision.toEnroll.length > 0) {
    const rows = decision.toEnroll.map((contactId) => ({
      campaign_id: opts.campaignId,
      contact_id: contactId,
      current_step: 1,
      status: enrollmentStatus,
      next_send_at: nextSendAt,
    }));
    const { error: enrollErr } = await db
      .from('campaign_enrollments')
      .upsert(rows, {
        onConflict: 'campaign_id,contact_id',
        ignoreDuplicates: true,
      });
    if (enrollErr) {
      console.error('[campaigns] enroll insert error:', enrollErr);
      return { ok: false, code: 'bad_request', message: 'Failed to enroll contacts' };
    }
  }

  let nextStatus = status;
  if (status === 'draft' && decision.toEnroll.length > 0) {
    const { error: upErr } = await db
      .from('campaigns')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', opts.campaignId)
      .eq('account_id', opts.accountId);
    if (upErr) {
      console.error('[campaigns] activate error:', upErr);
      return { ok: false, code: 'bad_request', message: 'Failed to activate campaign' };
    }
    nextStatus = 'active';
  }

  return {
    ok: true,
    enrolled: decision.toEnroll.length,
    skipped_no_consent: decision.skippedNoConsent.length,
    already_enrolled: decision.alreadyEnrolled.length,
    campaign_status: nextStatus,
  };
}

export async function pauseCampaign(
  db: SupabaseClient,
  accountId: string,
  campaignId: string
): Promise<
  | { ok: true; status: 'paused'; paused_enrollments: number }
  | { ok: false; code: 'not_found' | 'bad_request'; message: string }
> {
  const { data: campaign, error } = await db
    .from('campaigns')
    .select('id, status')
    .eq('id', campaignId)
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) {
    console.error('[campaigns] pause load error:', error);
    return { ok: false, code: 'bad_request', message: 'Failed to load campaign' };
  }
  if (!campaign) {
    return { ok: false, code: 'not_found', message: 'Campaign not found' };
  }
  if (TERMINAL_STATUSES.has(campaign.status as string)) {
    return {
      ok: false,
      code: 'bad_request',
      message: 'Campaign is completed or archived',
    };
  }

  const { error: upErr } = await db
    .from('campaigns')
    .update({ status: 'paused', updated_at: new Date().toISOString() })
    .eq('id', campaignId)
    .eq('account_id', accountId);
  if (upErr) {
    console.error('[campaigns] pause update error:', upErr);
    return { ok: false, code: 'bad_request', message: 'Failed to pause campaign' };
  }

  const { data: held, error: holdErr } = await db
    .from('campaign_enrollments')
    .update({ status: 'paused', next_send_at: null })
    .eq('campaign_id', campaignId)
    .eq('status', 'active')
    .select('id');
  if (holdErr) {
    console.error('[campaigns] pause enrollments error:', holdErr);
    return { ok: false, code: 'bad_request', message: 'Failed to hold enrollments' };
  }

  return {
    ok: true,
    status: 'paused',
    paused_enrollments: held?.length ?? 0,
  };
}
