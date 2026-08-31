import { describe, expect, it } from 'vitest';
import { filterByEligibleIds } from '../consent';

/**
 * Documents US-3: cron re-checks consent at fire time. The cron route
 * loads pending recipients, then keeps only loadMarketingEligibleIds.
 * This unit test locks the filter used after that lookup.
 */
describe('scheduled fire-time consent filter', () => {
  it('drops STOP / no-consent rows that were eligible at schedule time', () => {
    const eligibleNow = new Set(['still-ok']);
    const recipients = [
      { id: 'still-ok', opted_out: false },
      { id: 'stopped-after-schedule', opted_out: false },
      { id: 'opted', opted_out: true },
    ];
    expect(filterByEligibleIds(recipients, eligibleNow).map((r) => r.id)).toEqual([
      'still-ok',
    ]);
  });
});
