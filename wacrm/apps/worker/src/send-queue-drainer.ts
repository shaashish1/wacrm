import { createClient } from '@supabase/supabase-js';
import type { IMessagingProvider } from '@wacrm/shared';
import { RateGovernor } from './rate-governor';
import { sendCloudApiTemplate } from './cloud-api-send';
import { contactMayReceiveMarketing } from './consent';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DRAIN_INTERVAL_MS = 750;
const CLAIM_LIMIT = 5;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface SendQueueRow {
  id: string;
  account_id: string;
  provider_type: 'wwebjs' | 'cloud_api';
  action: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

/**
 * Polls `send_queue` independently of HTTP requests / BullMQ so a
 * closed tab or API timeout cannot strand an in-progress broadcast.
 */
export class SendQueueDrainer {
  private timer?: ReturnType<typeof setInterval>;
  private inFlight = false;

  constructor(
    private provider: IMessagingProvider,
    private rateGovernor: RateGovernor,
    private onBroadcastProgress: (broadcastId: string) => Promise<void>,
  ) {}

  start() {
    console.log('[SendQueue] Starting durable drain loop');
    this.timer = setInterval(() => {
      void this.tick();
    }, DRAIN_INTERVAL_MS);
    void this.tick();
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async tick() {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      const { data, error } = await supabase.rpc('claim_send_queue_jobs', {
        p_limit: CLAIM_LIMIT,
      });
      if (error) {
        console.error('[SendQueue] claim failed:', error.message);
        return;
      }
      const rows = (data ?? []) as SendQueueRow[];
      for (const row of rows) {
        await this.processRow(row);
      }
    } catch (err) {
      console.error('[SendQueue] tick error:', err);
    } finally {
      this.inFlight = false;
    }
  }

  private async processRow(row: SendQueueRow) {
    const payload = row.payload ?? {};
    const options = (payload.options ?? {}) as {
      broadcastRecipientId?: string;
      broadcastId?: string;
      contactId?: string;
    };

    try {
      if (options.contactId) {
        const { data: contact } = await supabase
          .from('contacts')
          .select('opted_out')
          .eq('id', options.contactId)
          .maybeSingle();
        if (contact?.opted_out) {
          await this.completeJob(row, null);
          await this.markRecipient(
            options.broadcastRecipientId,
            'failed',
            'Contact opted out',
            null,
          );
          if (options.broadcastId) await this.onBroadcastProgress(options.broadcastId);
          return;
        }
        const isMarketing = Boolean(options.broadcastRecipientId || options.broadcastId);
        if (isMarketing) {
          const allowed = await contactMayReceiveMarketing(
            supabase,
            options.contactId,
            'whatsapp',
          );
          if (!allowed) {
            await this.completeJob(row, null);
            await this.markRecipient(
              options.broadcastRecipientId,
              'failed',
              'No marketing consent or opted out',
              null,
            );
            if (options.broadcastId) await this.onBroadcastProgress(options.broadcastId);
            return;
          }
        }
      }

      const isBroadcast = Boolean(options.broadcastRecipientId);
      if (['sendText', 'sendMedia', 'sendTemplate'].includes(row.action)) {
        try {
          await this.rateGovernor.enforceLimits(
            row.account_id,
            isBroadcast ? { jitterMinMs: 1000, jitterMaxMs: 3000 } : undefined,
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (message.includes('Daily message limit')) {
            await this.failPermanently(row, message, options);
            return;
          }
          throw err;
        }
      }

      const result = await this.execute(row, payload);
      await this.completeJob(row, result.messageId);
      await this.markRecipient(
        options.broadcastRecipientId,
        'sent',
        null,
        result.messageId,
      );
      if (options.broadcastId) await this.onBroadcastProgress(options.broadcastId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.retryOrDeadLetter(row, message, options);
    }
  }

  private async execute(
    row: SendQueueRow,
    payload: Record<string, unknown>,
  ): Promise<{ messageId: string }> {
    const to = String(payload.to ?? '');
    if (row.provider_type === 'cloud_api' && row.action === 'sendTemplate') {
      return sendCloudApiTemplate({
        accountId: row.account_id,
        to,
        templateName: String(payload.template_name ?? ''),
        languageCode: String(payload.template_language ?? 'en_US'),
        components: Array.isArray(payload.components) ? payload.components : undefined,
      });
    }

    const status = await this.provider.getSessionStatus(row.account_id);
    if (status !== 'connected') {
      throw new Error('Session not connected');
    }

    const options = payload.options as object | undefined;
    switch (row.action) {
      case 'sendText':
        return this.provider.sendText(
          row.account_id,
          to,
          String(payload.body ?? ''),
          options,
        );
      case 'sendMedia':
        return this.provider.sendMedia(
          row.account_id,
          to,
          (payload.kind as 'image' | 'video' | 'document' | 'audio') || 'image',
          (payload.media as { link?: string }) ?? {},
          typeof payload.caption === 'string' ? payload.caption : undefined,
          options,
        );
      default:
        throw new Error(`Unknown send_queue action: ${row.action}`);
    }
  }

  private async completeJob(row: SendQueueRow, messageId: string | null) {
    await supabase
      .from('send_queue')
      .update({
        status: 'completed',
        error_message: null,
      })
      .eq('id', row.id);
  }

  private async retryOrDeadLetter(
    row: SendQueueRow,
    message: string,
    options: { broadcastRecipientId?: string; broadcastId?: string },
  ) {
    const attempts = (row.attempts ?? 0) + 1;
    const max = row.max_attempts ?? 3;
    if (attempts >= max) {
      await this.failPermanently(row, message, options);
      return;
    }
    const delayMs = Math.min(60_000, 2000 * 2 ** (attempts - 1));
    const { error } = await supabase
      .from('send_queue')
      .update({
        status: 'pending',
        attempts,
        error_message: message,
        next_attempt_at: new Date(Date.now() + delayMs).toISOString(),
      })
      .eq('id', row.id);
    if (error) {
      console.error(`[SendQueue] retry update ${row.id} failed:`, error.message);
    }
  }

  private async failPermanently(
    row: SendQueueRow,
    message: string,
    options: { broadcastRecipientId?: string; broadcastId?: string },
  ) {
    await supabase
      .from('send_queue')
      .update({
        status: 'failed',
        attempts: row.max_attempts ?? 3,
        error_message: message,
      })
      .eq('id', row.id);
    await this.markRecipient(
      options.broadcastRecipientId,
      'failed',
      message,
      null,
    );
    if (options.broadcastId) await this.onBroadcastProgress(options.broadcastId);
  }

  private async markRecipient(
    recipientId: string | undefined,
    status: 'sent' | 'failed',
    errorMessage: string | null,
    messageId: string | null,
  ) {
    if (!recipientId) return;
    const patch: Record<string, unknown> = {
      status,
      error_message: errorMessage,
    };
    if (status === 'sent') {
      patch.sent_at = new Date().toISOString();
      patch.whatsapp_message_id = messageId;
    }
    const { error } = await supabase
      .from('broadcast_recipients')
      .update(patch)
      .eq('id', recipientId);
    if (error) {
      console.error(
        `[SendQueue] mark recipient ${recipientId} ${status} failed:`,
        error.message,
      );
    }
  }
}
