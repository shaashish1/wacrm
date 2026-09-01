// ============================================================
// Outbound webhook delivery — durable queue + retry.
//
// `dispatchWebhookEvent` finds the account's active endpoints
// subscribed to an event, persists one `webhook_deliveries` row per
// sink (same payload `id` on every retry so receivers can dedupe),
// then best-effort drains due rows. A failed HTTP attempt must not
// affect the 200 OK returned to Meta — callers still fire this from
// `after()`, and this function never throws.
//
// Drain also runs from `/api/webhooks/cron` and the worker
// (`WebhookDeliveryDrainer`) so retries happen without another inbound
// event. Claim uses SKIP LOCKED so overlapping drainers cannot
// double-POST the same row.
//
// Delivery semantics (documented in docs/public-api.md):
//   - At-least-once: retries re-sign with a fresh timestamp but keep
//     the same body `id`. Receivers must dedupe on `id`.
//   - Redirects are not followed (SSRF).
//   - Each consecutive HTTP failure bumps endpoint `failure_count`;
//     once it crosses MAX_CONSECUTIVE_FAILURES the endpoint is
//     auto-disabled. A success resets the counter.
//   - SSRF / decrypt failures are permanent (no retry — they will
//     not become deliverable).
// ============================================================

import { randomUUID } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import { decrypt } from '@/lib/whatsapp/encryption';
import { nextWebhookBackoffMs, WEBHOOK_MAX_ATTEMPTS } from '@/lib/webhooks/backoff';
import { buildSignatureHeader } from '@/lib/webhooks/sign';
import { isDeliverableUrl } from '@/lib/webhooks/ssrf';
import type { WebhookEvent } from '@/lib/webhooks/events';

/** Per-endpoint HTTP timeout. Kept short — first attempt may run in `after()`. */
export const DELIVERY_TIMEOUT_MS = 5000;

/** Auto-disable an endpoint after this many consecutive failures. */
export const MAX_CONSECUTIVE_FAILURES = 15;

export { WEBHOOK_MAX_ATTEMPTS, nextWebhookBackoffMs } from '@/lib/webhooks/backoff';

export const WEBHOOK_DRAIN_LIMIT = 10;

interface EndpointRow {
  id: string;
  url: string;
  secret: string;
  is_active?: boolean;
}

export interface WebhookDeliveryRow {
  id: string;
  account_id: string;
  endpoint_id: string;
  event: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

export interface DrainResult {
  claimed: number;
  delivered: number;
  failed: number;
  retried: number;
  skipped: number;
}

/**
 * Enqueue `event` (+ `data`) for every active endpoint of `accountId`
 * subscribed to it, then drain due rows (including the new ones).
 * Never throws.
 */
export async function dispatchWebhookEvent(
  db: SupabaseClient,
  accountId: string,
  event: WebhookEvent,
  data: unknown
): Promise<void> {
  try {
    await enqueueWebhookDeliveries(db, accountId, event, data);
    await drainWebhookDeliveries(db);
  } catch (err) {
    // Never let a delivery problem bubble into the webhook response.
    console.error('[webhooks] dispatch failed:', err);
  }
}

/**
 * Persist one pending row per subscribed endpoint. The payload `id`
 * is generated here and reused on every retry.
 */
export async function enqueueWebhookDeliveries(
  db: SupabaseClient,
  accountId: string,
  event: WebhookEvent,
  data: unknown
): Promise<number> {
  const { data: rows, error } = await db
    .from('webhook_endpoints')
    .select('id, url, secret')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .contains('events', [event]);

  if (error || !rows || rows.length === 0) return 0;

  const payload = {
    id: randomUUID(),
    event,
    occurred_at: new Date().toISOString(),
    account_id: accountId,
    data,
  };

  const inserts = (rows as EndpointRow[]).map((row) => ({
    account_id: accountId,
    endpoint_id: row.id,
    event,
    payload,
    status: 'pending',
    attempts: 0,
    max_attempts: WEBHOOK_MAX_ATTEMPTS,
    next_attempt_at: new Date().toISOString(),
  }));

  const { error: insertError } = await db.from('webhook_deliveries').insert(inserts);
  if (insertError) {
    console.error('[webhooks] enqueue failed:', insertError);
    return 0;
  }
  return inserts.length;
}

/**
 * Claim due pending rows and attempt HTTP delivery. Safe to call
 * from `after()`, cron, or any service-role context.
 */
export async function drainWebhookDeliveries(
  db: SupabaseClient,
  limit = WEBHOOK_DRAIN_LIMIT
): Promise<DrainResult> {
  const result: DrainResult = {
    claimed: 0,
    delivered: 0,
    failed: 0,
    retried: 0,
    skipped: 0,
  };
  try {
    const { data, error } = await db.rpc('claim_webhook_deliveries', {
      p_limit: limit,
    });
    if (error) {
      console.error('[webhooks] claim failed:', error);
      return result;
    }
    const rows = (data ?? []) as WebhookDeliveryRow[];
    result.claimed = rows.length;
    for (const row of rows) {
      const outcome = await processWebhookDelivery(db, row);
      result[outcome] += 1;
    }
  } catch (err) {
    console.error('[webhooks] drain failed:', err);
  }
  return result;
}

export async function processWebhookDelivery(
  db: SupabaseClient,
  row: WebhookDeliveryRow
): Promise<'delivered' | 'failed' | 'retried' | 'skipped'> {
  const { data: endpoint, error } = await db
    .from('webhook_endpoints')
    .select('id, url, secret, is_active')
    .eq('id', row.endpoint_id)
    .maybeSingle();

  if (error || !endpoint) {
    await finalizeDelivery(db, row.id, 'failed', 'endpoint missing');
    return 'failed';
  }

  const ep = endpoint as EndpointRow;
  if (ep.is_active === false) {
    await finalizeDelivery(db, row.id, 'skipped', 'endpoint inactive');
    return 'skipped';
  }

  if (!(await isDeliverableUrl(ep.url))) {
    console.warn('[webhooks] refusing non-public delivery target for', ep.id);
    await recordFailure(db, ep);
    await finalizeDelivery(db, row.id, 'failed', 'non-public delivery target');
    return 'failed';
  }

  let secret: string;
  try {
    secret = decrypt(ep.secret);
  } catch (err) {
    console.error('[webhooks] secret decrypt failed for', ep.id, err);
    await recordFailure(db, ep);
    await finalizeDelivery(db, row.id, 'failed', 'secret decrypt failed');
    return 'failed';
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
      // Do NOT follow redirects — a public URL could 3xx-bounce to an
      // internal address, bypassing the SSRF check above.
      redirect: 'manual',
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`endpoint responded ${res.status}`);

    await db
      .from('webhook_endpoints')
      .update({ failure_count: 0, last_delivery_at: new Date().toISOString() })
      .eq('id', ep.id);
    await finalizeDelivery(db, row.id, 'delivered', null);
    return 'delivered';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[webhooks] delivery to ${ep.id} failed:`, message);
    await recordFailure(db, ep);
    return retryOrFail(db, row, message);
  }
}

async function retryOrFail(
  db: SupabaseClient,
  row: WebhookDeliveryRow,
  message: string
): Promise<'failed' | 'retried'> {
  const attempts = (row.attempts ?? 0) + 1;
  const max = row.max_attempts ?? WEBHOOK_MAX_ATTEMPTS;
  if (attempts >= max) {
    await finalizeDelivery(db, row.id, 'failed', message, attempts);
    return 'failed';
  }
  const delayMs = nextWebhookBackoffMs(attempts);
  const { error } = await db
    .from('webhook_deliveries')
    .update({
      status: 'pending',
      attempts,
      last_error: message,
      next_attempt_at: new Date(Date.now() + delayMs).toISOString(),
    })
    .eq('id', row.id);
  if (error) {
    console.error('[webhooks] retry update failed for', row.id, error);
  }
  return 'retried';
}

async function finalizeDelivery(
  db: SupabaseClient,
  id: string,
  status: 'delivered' | 'failed' | 'skipped',
  lastError: string | null,
  attempts?: number
): Promise<void> {
  const patch: Record<string, unknown> = {
    status,
    last_error: lastError,
  };
  if (attempts != null) patch.attempts = attempts;
  const { error } = await db.from('webhook_deliveries').update(patch).eq('id', id);
  if (error) {
    console.error('[webhooks] finalize failed for', id, error);
  }
}

async function recordFailure(db: SupabaseClient, row: EndpointRow): Promise<void> {
  const { error } = await db.rpc('record_webhook_failure', {
    endpoint_id: row.id,
    max_failures: MAX_CONSECUTIVE_FAILURES,
  });
  if (error) {
    console.error('[webhooks] record_webhook_failure failed for', row.id, error);
  }
}
