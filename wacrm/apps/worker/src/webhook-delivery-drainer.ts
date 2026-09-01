import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

import {
  DELIVERY_TIMEOUT_MS,
  MAX_CONSECUTIVE_FAILURES,
  nextWebhookBackoffMs,
  WEBHOOK_DRAIN_LIMIT,
  WEBHOOK_MAX_ATTEMPTS,
} from './webhook-backoff';
import { buildSignatureHeader } from './webhook-sign';
import { isDeliverableUrl } from './webhook-ssrf';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';
const DRAIN_INTERVAL_MS = 750;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface DeliveryRow {
  id: string;
  account_id: string;
  endpoint_id: string;
  event: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

interface EndpointRow {
  id: string;
  url: string;
  secret: string;
  is_active: boolean;
}

function decryptSecret(encryptedText: string): string {
  if (!ENCRYPTION_KEY) return encryptedText;
  const parts = encryptedText.split(':');
  const keyBuf = Buffer.from(ENCRYPTION_KEY, 'hex');
  if (parts.length === 3) {
    const [ivHex, ctHex, tagHex] = parts;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      keyBuf,
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(ctHex, 'hex', 'utf8') + decipher.final('utf8');
  }
  if (parts.length === 2) {
    const [ivHex, ctHex] = parts;
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      keyBuf,
      Buffer.from(ivHex, 'hex'),
    );
    return decipher.update(ctHex, 'hex', 'utf8') + decipher.final('utf8');
  }
  throw new Error('unrecognised secret format');
}

/**
 * Polls `webhook_deliveries` independently of the Next.js `after()`
 * first attempt so retries survive a web process restart.
 */
export class WebhookDeliveryDrainer {
  private timer?: ReturnType<typeof setInterval>;
  private inFlight = false;

  start() {
    console.log('[WebhookQueue] Starting durable drain loop');
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
      const { data, error } = await supabase.rpc('claim_webhook_deliveries', {
        p_limit: WEBHOOK_DRAIN_LIMIT,
      });
      if (error) {
        console.error('[WebhookQueue] claim failed:', error.message);
        return;
      }
      const rows = (data ?? []) as DeliveryRow[];
      for (const row of rows) {
        await this.processRow(row);
      }
    } catch (err) {
      console.error('[WebhookQueue] tick error:', err);
    } finally {
      this.inFlight = false;
    }
  }

  private async processRow(row: DeliveryRow) {
    const { data: endpoint, error } = await supabase
      .from('webhook_endpoints')
      .select('id, url, secret, is_active')
      .eq('id', row.endpoint_id)
      .maybeSingle();

    if (error || !endpoint) {
      await this.finalize(row.id, 'failed', 'endpoint missing');
      return;
    }

    const ep = endpoint as EndpointRow;
    if (!ep.is_active) {
      await this.finalize(row.id, 'skipped', 'endpoint inactive');
      return;
    }

    if (!(await isDeliverableUrl(ep.url))) {
      console.warn('[WebhookQueue] refusing non-public target', ep.id);
      await this.recordEndpointFailure(ep.id);
      await this.finalize(row.id, 'failed', 'non-public delivery target');
      return;
    }

    let secret: string;
    try {
      secret = decryptSecret(ep.secret);
    } catch (err) {
      console.error('[WebhookQueue] secret decrypt failed for', ep.id, err);
      await this.recordEndpointFailure(ep.id);
      await this.finalize(row.id, 'failed', 'secret decrypt failed');
      return;
    }

    const rawBody = JSON.stringify(row.payload);
    const tsSeconds = Math.floor(Date.now() / 1000);

    try {
      const res = await fetch(ep.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wacrm-Event': row.event,
          'X-Wacrm-Webhook-Id': ep.id,
          'X-Wacrm-Signature': buildSignatureHeader(rawBody, secret, tsSeconds),
        },
        body: rawBody,
        redirect: 'manual',
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`endpoint responded ${res.status}`);

      await supabase
        .from('webhook_endpoints')
        .update({ failure_count: 0, last_delivery_at: new Date().toISOString() })
        .eq('id', ep.id);
      await this.finalize(row.id, 'delivered', null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[WebhookQueue] delivery to ${ep.id} failed:`, message);
      await this.recordEndpointFailure(ep.id);
      await this.retryOrFail(row, message);
    }
  }

  private async retryOrFail(row: DeliveryRow, message: string) {
    const attempts = (row.attempts ?? 0) + 1;
    const max = row.max_attempts ?? WEBHOOK_MAX_ATTEMPTS;
    if (attempts >= max) {
      await this.finalize(row.id, 'failed', message, attempts);
      return;
    }
    const delayMs = nextWebhookBackoffMs(attempts);
    const { error } = await supabase
      .from('webhook_deliveries')
      .update({
        status: 'pending',
        attempts,
        last_error: message,
        next_attempt_at: new Date(Date.now() + delayMs).toISOString(),
      })
      .eq('id', row.id);
    if (error) {
      console.error(`[WebhookQueue] retry update ${row.id} failed:`, error.message);
    }
  }

  private async finalize(
    id: string,
    status: 'delivered' | 'failed' | 'skipped',
    lastError: string | null,
    attempts?: number,
  ) {
    const patch: Record<string, unknown> = { status, last_error: lastError };
    if (attempts != null) patch.attempts = attempts;
    const { error } = await supabase.from('webhook_deliveries').update(patch).eq('id', id);
    if (error) {
      console.error(`[WebhookQueue] finalize ${id} failed:`, error.message);
    }
  }

  private async recordEndpointFailure(endpointId: string) {
    const { error } = await supabase.rpc('record_webhook_failure', {
      endpoint_id: endpointId,
      max_failures: MAX_CONSECUTIVE_FAILURES,
    });
    if (error) {
      console.error('[WebhookQueue] record_webhook_failure failed:', error.message);
    }
  }
}
