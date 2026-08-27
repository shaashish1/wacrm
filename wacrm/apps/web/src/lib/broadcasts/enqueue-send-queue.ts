import { supabaseAdmin } from '@/lib/flows/admin-client';
import type { ProviderType } from '@wacrm/shared';

const INSERT_CHUNK = 200;

export interface SendQueueJobInput {
  accountId: string;
  providerType: ProviderType;
  action: 'sendText' | 'sendMedia' | 'sendTemplate';
  payload: Record<string, unknown>;
}

/**
 * Insert durable outbound jobs. send_queue RLS only allows admins
 * from the client, so callers must use the service-role helper.
 */
export async function insertSendQueueJobs(
  jobs: SendQueueJobInput[],
): Promise<void> {
  if (jobs.length === 0) return;
  const admin = supabaseAdmin();
  const rows = jobs.map((j) => ({
    account_id: j.accountId,
    provider_type: j.providerType,
    action: j.action,
    payload: j.payload,
    status: 'pending',
    attempts: 0,
    max_attempts: 3,
    next_attempt_at: new Date().toISOString(),
  }));

  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    const { error } = await admin.from('send_queue').insert(chunk);
    if (error) {
      throw new Error(`Failed to enqueue send_queue batch: ${error.message}`);
    }
  }
}

export async function markRecipientsQueued(
  recipientIds: string[],
): Promise<void> {
  if (recipientIds.length === 0) return;
  const admin = supabaseAdmin();
  for (let i = 0; i < recipientIds.length; i += INSERT_CHUNK) {
    const ids = recipientIds.slice(i, i + INSERT_CHUNK);
    const { error } = await admin
      .from('broadcast_recipients')
      .update({ status: 'queued' })
      .in('id', ids)
      .in('status', ['pending']);
    if (error) {
      console.warn('[send_queue] queued status update failed:', error.message);
    }
  }
}
