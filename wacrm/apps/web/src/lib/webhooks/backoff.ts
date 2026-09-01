// ============================================================
// Webhook delivery retry backoff — pure, no I/O.
//
// Kept separate from `deliver.ts` so the formula is unit-tested
// without a fetch mock. The worker copies the same numbers
// (`apps/worker/src/webhook-backoff.ts`) so both drainers agree.
// ============================================================

/** Per-row retry budget. Exhausted rows stay `failed` (not re-queued). */
export const WEBHOOK_MAX_ATTEMPTS = 8;

/** Cap so a dead sink does not sit in `pending` for hours. */
export const WEBHOOK_BACKOFF_CAP_MS = 300_000;

/** First retry delay (then doubles: 2s, 4s, 8s, …). */
export const WEBHOOK_BACKOFF_BASE_MS = 2_000;

/**
 * Delay until the next attempt after `attempts` failures
 * (`attempts` is the count *after* this failure, ≥ 1).
 */
export function nextWebhookBackoffMs(attempts: number): number {
  const n = Math.max(1, Math.floor(attempts));
  return Math.min(WEBHOOK_BACKOFF_CAP_MS, WEBHOOK_BACKOFF_BASE_MS * 2 ** (n - 1));
}
