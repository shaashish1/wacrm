import type { SupabaseClient } from '@supabase/supabase-js';

export interface AnalyticsInput {
  campaignId?: string;
  from?: string;
  to?: string;
}

export interface FunnelArtifact {
  from: string;
  to: string;
  campaign_id: string | null;
  contacts: number;
  landing_attributed: number;
  consents_active_whatsapp: number;
  opted_out: number;
  broadcasts_sent: number;
  campaign_enrollments: number | null;
}

export interface TaskStatsArtifact {
  total: number;
  by_agent: Record<string, Record<string, number>>;
}

export interface OptOutRateArtifact {
  contacts: number;
  opted_out: number;
  rate: number;
  consents_active_whatsapp: number;
  consents_revoked: number;
}

export async function runAnalyticsSkill(
  db: SupabaseClient,
  accountId: string,
  skill: string,
  input: AnalyticsInput,
): Promise<FunnelArtifact | TaskStatsArtifact | OptOutRateArtifact> {
  if (skill === 'opt_out_rate') {
    return loadOptOutRate(db, accountId);
  }
  if (skill === 'agent_task_stats') {
    return loadTaskStats(db, accountId);
  }
  if (skill === 'campaign_funnel' || !skill) {
    return loadFunnel(db, accountId, input);
  }
  throw new Error(`Unknown analytics skill: ${skill}`);
}

export function computeOptOutRate(contacts: number, optedOut: number): number {
  if (contacts <= 0) return 0;
  return Math.round((optedOut / contacts) * 10000) / 10000;
}

async function loadOptOutRate(
  db: SupabaseClient,
  accountId: string,
): Promise<OptOutRateArtifact> {
  const [contacts, optedOut, activeWa, revoked] = await Promise.all([
    count(db, 'contacts', (q) => q.eq('account_id', accountId)),
    count(db, 'contacts', (q) =>
      q.eq('account_id', accountId).eq('opted_out', true),
    ),
    count(db, 'consents', (q) =>
      q.eq('account_id', accountId).eq('channel', 'whatsapp').is('revoked_at', null),
    ),
    count(db, 'consents', (q) =>
      q.eq('account_id', accountId).not('revoked_at', 'is', null),
    ),
  ]);
  return {
    contacts,
    opted_out: optedOut,
    rate: computeOptOutRate(contacts, optedOut),
    consents_active_whatsapp: activeWa,
    consents_revoked: revoked,
  };
}

async function loadTaskStats(
  db: SupabaseClient,
  accountId: string,
): Promise<TaskStatsArtifact> {
  const { data, error } = await db
    .from('a2a_tasks')
    .select('agent_id, state')
    .eq('account_id', accountId);
  if (error) throw new Error(error.message);
  const byAgent: Record<string, Record<string, number>> = {};
  for (const row of data ?? []) {
    const agent = String(row.agent_id ?? 'unknown');
    const state = String(row.state ?? 'unknown');
    byAgent[agent] ??= {};
    byAgent[agent][state] = (byAgent[agent][state] ?? 0) + 1;
  }
  return {
    total: (data ?? []).length,
    by_agent: byAgent,
  };
}

async function loadFunnel(
  db: SupabaseClient,
  accountId: string,
  input: AnalyticsInput,
): Promise<FunnelArtifact> {
  const range = dateRange(input.from, input.to);
  const campaignId =
    typeof input.campaignId === 'string' && input.campaignId
      ? input.campaignId
      : null;

  const [
    contacts,
    landingAttributed,
    consentsActive,
    optedOut,
    broadcastsSent,
  ] = await Promise.all([
    count(db, 'contacts', (q) =>
      q
        .eq('account_id', accountId)
        .gte('created_at', range.from)
        .lte('created_at', range.to),
    ),
    count(db, 'contacts', (q) =>
      q
        .eq('account_id', accountId)
        .not('landing_id', 'is', null)
        .gte('created_at', range.from)
        .lte('created_at', range.to),
    ),
    count(db, 'consents', (q) =>
      q
        .eq('account_id', accountId)
        .eq('channel', 'whatsapp')
        .is('revoked_at', null)
        .gte('granted_at', range.from)
        .lte('granted_at', range.to),
    ),
    count(db, 'contacts', (q) =>
      q.eq('account_id', accountId).eq('opted_out', true),
    ),
    count(db, 'broadcasts', (q) =>
      q
        .eq('account_id', accountId)
        .in('status', ['sent', 'sending'])
        .gte('created_at', range.from)
        .lte('created_at', range.to),
    ),
  ]);

  let enrollments: number | null = null;
  if (campaignId) {
    const { data: campaign } = await db
      .from('campaigns')
      .select('id')
      .eq('id', campaignId)
      .eq('account_id', accountId)
      .maybeSingle();
    if (!campaign) {
      throw new Error('Campaign not found');
    }
    enrollments = await count(db, 'campaign_enrollments', (q) =>
      q.eq('campaign_id', campaignId),
    );
  }

  return {
    from: range.from,
    to: range.to,
    campaign_id: campaignId,
    contacts,
    landing_attributed: landingAttributed,
    consents_active_whatsapp: consentsActive,
    opted_out: optedOut,
    broadcasts_sent: broadcastsSent,
    campaign_enrollments: enrollments,
  };
}

interface CountQuery {
  eq(column: string, value: unknown): CountQuery;
  in(column: string, values: readonly string[]): CountQuery;
  is(column: string, value: null): CountQuery;
  not(column: string, op: string, value: unknown): CountQuery;
  gte(column: string, value: string): CountQuery;
  lte(column: string, value: string): CountQuery;
  then<TResult1 = CountPayload>(
    onfulfilled?:
      | ((value: CountPayload) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1>;
}

type CountPayload = {
  count: number | null;
  error: { message: string } | null;
};

async function count(
  db: SupabaseClient,
  table: string,
  apply: (query: CountQuery) => CountQuery,
): Promise<number> {
  const base = db.from(table).select('id', { count: 'exact', head: true });
  const { count: n, error } = await apply(base as unknown as CountQuery);
  if (error) throw new Error(error.message);
  return n ?? 0;
}

function dateRange(from?: string, to?: string): { from: string; to: string } {
  const end = to ? new Date(to) : new Date();
  const start = from
    ? new Date(from)
    : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('from/to must be ISO timestamps');
  }
  return { from: start.toISOString(), to: end.toISOString() };
}
