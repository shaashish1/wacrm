import { describe, expect, it } from 'vitest';

import {
  nextWebhookBackoffMs,
  WEBHOOK_BACKOFF_BASE_MS,
  WEBHOOK_BACKOFF_CAP_MS,
  WEBHOOK_MAX_ATTEMPTS,
} from './backoff';

describe('nextWebhookBackoffMs', () => {
  it('starts at 2s and doubles', () => {
    expect(nextWebhookBackoffMs(1)).toBe(WEBHOOK_BACKOFF_BASE_MS);
    expect(nextWebhookBackoffMs(2)).toBe(4_000);
    expect(nextWebhookBackoffMs(3)).toBe(8_000);
    expect(nextWebhookBackoffMs(4)).toBe(16_000);
  });

  it('caps at five minutes', () => {
    expect(nextWebhookBackoffMs(8)).toBe(256_000);
    expect(nextWebhookBackoffMs(9)).toBe(WEBHOOK_BACKOFF_CAP_MS);
    expect(nextWebhookBackoffMs(20)).toBe(WEBHOOK_BACKOFF_CAP_MS);
  });

  it('treats zero / negative as the first attempt', () => {
    expect(nextWebhookBackoffMs(0)).toBe(WEBHOOK_BACKOFF_BASE_MS);
    expect(nextWebhookBackoffMs(-3)).toBe(WEBHOOK_BACKOFF_BASE_MS);
  });

  it('keeps the documented retry budget', () => {
    expect(WEBHOOK_MAX_ATTEMPTS).toBe(8);
  });
});
