import { IMessagingProvider } from '@wacrm/shared';
import { createClient } from '@supabase/supabase-js';
import { RateGovernor } from './rate-governor';
import { UnrecoverableError, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { agentLog } from './debug-log';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});
connection.on('connect', () => console.log('[Queue] Redis connected:', REDIS_URL));
connection.on('error', (err) => console.error('[Queue] Redis connection error:', err.message));

export class QueueProcessor {
  private provider: IMessagingProvider;
  public rateGovernor: RateGovernor;
  private worker?: Worker;

  constructor(provider: IMessagingProvider) {
    this.provider = provider;
    this.rateGovernor = new RateGovernor();
  }

  start() {
    console.log(`Starting BullMQ queue processor...`);

    this.worker = new Worker('wwebjs-messages', async (job: Job) => {
      await this.processItem(job);
    }, { connection, concurrency: 5 });

    this.worker.on('failed', (job, err) => {
      console.error(`Job ${job?.id} failed with error:`, err);
      void this.markBroadcastRecipientFailed(job, err);
    });

    this.worker.on('completed', (job) => {
      console.log(`Job ${job.id} completed successfully.`);
      const broadcastId = job.data?.payload?.options?.broadcastId as string | undefined;
      if (broadcastId) void this.maybeFinalizeBroadcast(broadcastId);
    });
  }

  private async processItem(job: Job) {
    const { accountId, action, payload } = job.data;

    if (action === 'initSession') {
      const status = await this.provider.getSessionStatus(accountId);
      // #region agent log
      agentLog('queue-processor.ts:initSession', 'initSession job received', { accountIdPrefix: String(accountId).slice(0, 8), status, willSkip: status === 'connected' }, 'B');
      // #endregion
      if (status === 'connected') return;

      // Reset the reconnect counter so a fresh "Generate QR" request starts
      // a clean reconnect cycle — otherwise a session that previously hit
      // max-retries would die on its first QR expiry again.
      (this.provider as any).resetReconnectAttempts?.(accountId);

      const { data: session } = await supabase
        .from('sessions')
        .select('config')
        .eq('account_id', accountId)
        .maybeSingle();
        
      const sessionConfig = { ...(session?.config || {}), ...(payload ?? {}) };

      console.log(`[Queue] Initializing Baileys session for ${accountId}...`);
      await this.provider.initializeSession(accountId, sessionConfig);
      return;
    }

    if (action === 'syncGroups') {
      console.log(`[Queue] Syncing WhatsApp groups for ${accountId}...`);
      const result = await (this.provider as any).syncGroups(accountId);
      console.log(`[Queue] Group sync complete:`, result);
      return;
    }

    if (action === 'syncContacts') {
      console.log(`[Queue] Syncing WhatsApp address book for ${accountId}...`);
      const result = await (this.provider as any).syncAddressBook(accountId);
      console.log(`[Queue] Contact sync complete:`, result);
      return;
    }

    // We only process if the session is connected
    const status = await this.provider.getSessionStatus(accountId);
    if (status !== 'connected') {
      throw new Error('Session not connected');
    }

    let result;

    // Enforce Rate Governor before sending messages.
    // Broadcast jobs get 1–3s jitter so fan-out is not bursty.
    if (['sendText', 'sendMedia', 'sendTemplate'].includes(action)) {
      const isBroadcast = Boolean(payload?.options?.broadcastRecipientId);
      try {
        await this.rateGovernor.enforceLimits(
          accountId,
          isBroadcast ? { jitterMinMs: 1000, jitterMaxMs: 3000 } : undefined,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('Daily message limit')) {
          throw new UnrecoverableError(message);
        }
        throw err;
      }
    }

    switch (action) {
      case 'sendText':
        console.log(`[Queue] Sending text to ${payload.to} for account ${accountId}`);
        result = await this.provider.sendText(accountId, payload.to, payload.body, payload.options);
        console.log(`[Queue] Send result:`, result);
        break;
      case 'sendMedia':
        result = await this.provider.sendMedia(accountId, payload.to, payload.kind, payload.media, payload.caption, payload.options);
        break;
      case 'sendReaction':
        result = await this.provider.sendReaction(accountId, payload.to, payload.messageId, payload.emoji);
        break;
      case 'markAsRead':
        await this.provider.markAsRead(accountId, payload.messageId);
        result = { messageId: null };
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    if (result && result.messageId) {
      const { error: updateErr } = await supabase
        .from('messages')
        .update({ message_id: result.messageId })
        .eq('message_id', job.id!);
      if (updateErr) {
        console.error(`[Queue] Failed to update message_id for job ${job.id}:`, updateErr.message);
      } else {
        console.log(`[Queue] Updated message_id: ${job.id} -> ${result.messageId}`);
      }
    }

    await this.markBroadcastRecipientSent(payload, result?.messageId ?? null);
  }

  private async markBroadcastRecipientSent(
    payload: { options?: { broadcastRecipientId?: string; broadcastId?: string } },
    messageId: string | null,
  ) {
    const recipientId = payload?.options?.broadcastRecipientId;
    if (!recipientId) return;

    const { error } = await supabase
      .from('broadcast_recipients')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        whatsapp_message_id: messageId,
        error_message: null,
      })
      .eq('id', recipientId);
    if (error) {
      console.error(`[Queue] Failed to mark recipient ${recipientId} sent:`, error.message);
    }

    if (payload.options?.broadcastId) {
      await this.maybeFinalizeBroadcast(payload.options.broadcastId);
    }
  }

  private async markBroadcastRecipientFailed(job: Job | undefined, err: Error) {
    const recipientId = job?.data?.payload?.options?.broadcastRecipientId as
      | string
      | undefined;
    if (!recipientId) return;

    const { error } = await supabase
      .from('broadcast_recipients')
      .update({
        status: 'failed',
        error_message: err.message || 'Unknown error',
      })
      .eq('id', recipientId);
    if (error) {
      console.error(`[Queue] Failed to mark recipient ${recipientId} failed:`, error.message);
    }

    const broadcastId = job?.data?.payload?.options?.broadcastId as string | undefined;
    if (broadcastId) await this.maybeFinalizeBroadcast(broadcastId);
  }

  /**
   * Flip the parent broadcast to sent/failed once no recipients remain
   * queued or pending. Safe to call more than once.
   */
  async maybeFinalizeBroadcast(broadcastId: string) {
    const { count, error } = await supabase
      .from('broadcast_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('broadcast_id', broadcastId)
      .in('status', ['pending', 'queued']);
    if (error) {
      console.error(`[Queue] finalize count failed for ${broadcastId}:`, error.message);
      return;
    }
    if ((count ?? 0) > 0) return;

    const { count: sentCount } = await supabase
      .from('broadcast_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('broadcast_id', broadcastId)
      .in('status', ['sent', 'delivered', 'read', 'replied']);

    const finalStatus = (sentCount ?? 0) > 0 ? 'sent' : 'failed';
    const { data: updated, error: updErr } = await supabase
      .from('broadcasts')
      .update({
        status: finalStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', broadcastId)
      .eq('status', 'sending')
      .select('id, name, user_id, account_id, sent_count, failed_count, total_recipients')
      .maybeSingle();
    if (updErr) {
      console.error(`[Queue] finalize broadcast ${broadcastId} failed:`, updErr.message);
      return;
    }
    if (updated?.user_id && updated?.account_id) {
      const { error: nErr } = await supabase.from('notifications').insert({
        account_id: updated.account_id,
        user_id: updated.user_id,
        type: finalStatus === 'sent' ? 'broadcast_sent' : 'broadcast_failed',
        title:
          finalStatus === 'sent'
            ? `Broadcast sent: ${updated.name}`
            : `Broadcast failed: ${updated.name}`,
        body: `${updated.sent_count ?? sentCount ?? 0} sent, ${updated.failed_count ?? 0} failed of ${updated.total_recipients ?? 0}.`,
      });
      if (nErr) {
        console.warn(`[Queue] notify broadcast ${broadcastId} failed:`, nErr.message);
      }
    }
  }

  async stop() {
    if (this.worker) {
      await this.worker.close();
    }
  }
}
