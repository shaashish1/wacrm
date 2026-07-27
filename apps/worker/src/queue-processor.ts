import { IMessagingProvider } from '@wacrm/shared';
import { createClient } from '@supabase/supabase-js';
import { RateGovernor } from './rate-governor';
import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

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
    });

    this.worker.on('completed', (job) => {
      console.log(`Job ${job.id} completed successfully.`);
    });
  }

  private async processItem(job: Job) {
    const { accountId, action, payload } = job.data;

    if (action === 'initSession') {
      const status = await this.provider.getSessionStatus(accountId);
      if (status === 'connected') return;
      console.log(`[Queue] Initializing Baileys session for ${accountId}...`);
      await this.provider.initializeSession(accountId, payload ?? {});
      return;
    }

    if (action === 'syncGroups') {
      console.log(`[Queue] Syncing WhatsApp groups for ${accountId}...`);
      const result = await (this.provider as any).syncGroups(accountId);
      console.log(`[Queue] Group sync complete:`, result);
      return;
    }

    // We only process if the session is connected
    const status = await this.provider.getSessionStatus(accountId);
    if (status !== 'connected') {
      throw new Error('Session not connected');
    }

    let result;

    // Enforce Rate Governor before sending messages
    if (['sendText', 'sendMedia', 'sendTemplate'].includes(action)) {
      await this.rateGovernor.enforceLimits(accountId);
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
  }

  async stop() {
    if (this.worker) {
      await this.worker.close();
    }
  }
}
