import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { offerConsultSlots, runBookingSkill } from './booking';
import { hasPhi } from './phi';

describe('offerConsultSlots', () => {
  it('returns three weekday generic consult slots after the given instant', () => {
    // Saturday 2026-08-29 → first weekday is Monday.
    const slots = offerConsultSlots(new Date('2026-08-29T12:00:00.000Z'));
    expect(slots).toHaveLength(3);
    expect(slots.map((s) => s.index)).toEqual([1, 2, 3]);
    expect(slots.every((s) => ['consult', 'intro', 'tour'].includes(s.kind))).toBe(
      true,
    );
    for (const slot of slots) {
      const start = new Date(slot.start);
      const dow = start.getUTCDay();
      expect(dow === 0 || dow === 6).toBe(false);
      expect(start.getTime()).toBeGreaterThan(
        new Date('2026-08-29T12:00:00.000Z').getTime(),
      );
      expect(hasPhi(slot.label)).toBe(false);
    }
  });

  it('uses confirm copy without clinical reason codes', () => {
    const slots = offerConsultSlots(new Date('2026-08-31T08:00:00.000Z'));
    expect(slots[0].label.toLowerCase()).not.toMatch(/diagnos|mri|medication/);
  });
});

describe('runBookingSkill', () => {
  const db = {} as SupabaseClient;

  it('escalates and does not offer slots when inbound text looks like PHI', async () => {
    const result = await runBookingSkill(db, 'acct', 'offer_slots', {
      text: 'My MRI shows a tumor, book me',
    });
    expect(result.escalate).toBe(true);
    expect(result.status).toBe('handoff');
    expect(result.slots).toEqual([]);
    expect(result.appointment_id).toBeNull();
    expect(result.reason_code).toBe('phi_escalate');
  });

  it('handoff_human does not persist clinical narrative', async () => {
    const result = await runBookingSkill(db, 'acct', 'handoff_human', {});
    expect(result.escalate).toBe(true);
    expect(result.status).toBe('handoff');
    expect(hasPhi(result.copy)).toBe(false);
  });
});
