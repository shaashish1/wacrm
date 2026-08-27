import { describe, expect, it } from 'vitest';
import { isBroadcastRecurrence, nextScheduledAt } from './recurrence';

describe('nextScheduledAt', () => {
  it('advances one day for daily recurrence', () => {
    const now = Date.parse('2026-08-27T10:00:00.000Z');
    expect(nextScheduledAt('2026-08-27T09:00:00.000Z', 'daily', now)).toBe(
      '2026-08-28T09:00:00.000Z',
    );
  });

  it('skips missed windows until the next future slot', () => {
    const now = Date.parse('2026-08-30T10:00:00.000Z');
    expect(nextScheduledAt('2026-08-27T09:00:00.000Z', 'daily', now)).toBe(
      '2026-08-31T09:00:00.000Z',
    );
  });

  it('advances seven days for weekly recurrence', () => {
    const now = Date.parse('2026-08-27T10:00:00.000Z');
    expect(nextScheduledAt('2026-08-27T09:00:00.000Z', 'weekly', now)).toBe(
      '2026-09-03T09:00:00.000Z',
    );
  });
});

describe('isBroadcastRecurrence', () => {
  it('accepts daily and weekly only', () => {
    expect(isBroadcastRecurrence('daily')).toBe(true);
    expect(isBroadcastRecurrence('weekly')).toBe(true);
    expect(isBroadcastRecurrence('monthly')).toBe(false);
    expect(isBroadcastRecurrence(null)).toBe(false);
  });
});
