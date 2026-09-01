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

export const CAMPAIGN_SELECT =
  'id, name, channel, status, audience_type, audience_group_id, audience_filter, trigger_type, trigger_config, created_at, updated_at';

export const CAMPAIGN_STEP_SELECT =
  'id, campaign_id, position, channel, email_template_id, whatsapp_template_name, delay_hours, exit_on_reply, exit_on_stage_change, created_at';

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
