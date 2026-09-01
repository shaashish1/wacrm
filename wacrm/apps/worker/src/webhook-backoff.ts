/** Keep in sync with `apps/web/src/lib/webhooks/backoff.ts`. */
export const WEBHOOK_MAX_ATTEMPTS = 8;
export const WEBHOOK_BACKOFF_CAP_MS = 300_000;
export const WEBHOOK_BACKOFF_BASE_MS = 2_000;
export const MAX_CONSECUTIVE_FAILURES = 15;
export const DELIVERY_TIMEOUT_MS = 5000;
export const WEBHOOK_DRAIN_LIMIT = 10;

export function nextWebhookBackoffMs(attempts: number): number {
  const n = Math.max(1, Math.floor(attempts));
  return Math.min(WEBHOOK_BACKOFF_CAP_MS, WEBHOOK_BACKOFF_BASE_MS * 2 ** (n - 1));
}
