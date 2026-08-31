import type { SupabaseClient } from '@supabase/supabase-js';
import { isA2AAgentId, type A2AAgentId } from './cards';
import { runAnalyticsSkill, type AnalyticsInput } from './analytics';
import { runBookingSkill, type BookingInput } from './booking';
import { runComplianceSkill, type ComplianceInput } from './compliance';
import { runContentSkill, type ContentInput } from './content';
import { runQualifierSkill, type QualifierInput } from './qualifier';
import { hasPhi } from './phi';

export type A2ATaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'failed'
  | 'canceled';

export interface A2ATaskRow {
  id: string;
  account_id: string;
  agent_id: string;
  skill: string | null;
  state: A2ATaskState;
  context_id: string | null;
  input: Record<string, unknown> | null;
  artifacts: unknown;
  error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const TEXT_KEYS = ['text', 'copy', 'brief', 'headline', 'body', 'draft', 'subject'] as const;

export async function runA2ATask(
  db: SupabaseClient,
  opts: {
    accountId: string;
    userId: string | null;
    agentId: string;
    skill?: string;
    input?: Record<string, unknown>;
    contextId?: string;
  },
): Promise<A2ATaskRow> {
  if (!isA2AAgentId(opts.agentId)) {
    throw new Error(`Unknown agent: ${opts.agentId}`);
  }

  const input = sanitizeInput(opts.input ?? {});
  const { data: created, error: insErr } = await db
    .from('a2a_tasks')
    .insert({
      account_id: opts.accountId,
      agent_id: opts.agentId,
      skill: opts.skill ?? null,
      state: 'working',
      context_id: opts.contextId ?? null,
      input,
      created_by: opts.userId,
    })
    .select('*')
    .single();
  if (insErr || !created) {
    throw new Error(insErr?.message || 'Failed to create A2A task');
  }

  try {
    const artifact = await executeAgent(db, opts.accountId, opts.agentId, opts.skill ?? '', input);
    if (hasPhi(JSON.stringify(artifact))) {
      throw new Error('Artifact failed PHI scan');
    }
    const { data: done, error } = await db
      .from('a2a_tasks')
      .update({
        state: 'completed',
        artifacts: [artifact],
        updated_at: new Date().toISOString(),
      })
      .eq('id', created.id)
      .select('*')
      .single();
    if (error || !done) throw new Error(error?.message || 'Failed to complete task');
    return done as A2ATaskRow;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Task failed';
    await db
      .from('a2a_tasks')
      .update({
        state: 'failed',
        error: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', created.id);
    const { data: failed } = await db
      .from('a2a_tasks')
      .select('*')
      .eq('id', created.id)
      .single();
    return (failed ?? { ...created, state: 'failed', error: message }) as A2ATaskRow;
  }
}

export async function getA2ATask(
  db: SupabaseClient,
  accountId: string,
  taskId: string,
): Promise<A2ATaskRow | null> {
  const { data } = await db
    .from('a2a_tasks')
    .select('*')
    .eq('id', taskId)
    .eq('account_id', accountId)
    .maybeSingle();
  return (data as A2ATaskRow | null) ?? null;
}

export async function cancelA2ATask(
  db: SupabaseClient,
  accountId: string,
  taskId: string,
): Promise<A2ATaskRow | null> {
  const { data } = await db
    .from('a2a_tasks')
    .update({
      state: 'canceled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .eq('account_id', accountId)
    .in('state', ['submitted', 'working', 'input-required'])
    .select('*')
    .maybeSingle();
  return (data as A2ATaskRow | null) ?? null;
}

async function executeAgent(
  db: SupabaseClient,
  accountId: string,
  agentId: A2AAgentId,
  skill: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  switch (agentId) {
    case 'compliance':
      return runComplianceSkill(db, accountId, skill, input as ComplianceInput);
    case 'qualifier':
      return runQualifierSkill(db, accountId, skill, input as QualifierInput);
    case 'content':
      return runContentSkill(db, accountId, skill, input as ContentInput);
    case 'booking':
      return runBookingSkill(db, accountId, skill, input as BookingInput);
    case 'analytics':
      return runAnalyticsSkill(db, accountId, skill, input as AnalyticsInput);
  }
}

function sanitizeInput(input: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...input };
  for (const key of TEXT_KEYS) {
    if (typeof next[key] === 'string' && hasPhi(next[key] as string)) {
      next[key] = '[redacted: possible clinical content — escalate to phone/portal]';
      next.phi_redacted = true;
      if (key === 'copy') next.copy_phi = true;
    }
  }
  return next;
}
