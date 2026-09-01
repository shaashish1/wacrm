import { describe, expect, it } from 'vitest';

import {
  parseContactIds,
  serializeContactGroup,
  serializeWaGroup,
  serializeWaParticipant,
} from './groups';

describe('serializeWaGroup', () => {
  it('nulls missing subject and coerces flags', () => {
    expect(
      serializeWaGroup({
        id: 'g1',
        jid: '120@g.us',
        subject: null,
        size: 12,
        is_community: 1,
        announce: false,
        restrict: true,
        synced_at: '2026-01-01T00:00:00Z',
      })
    ).toEqual({
      id: 'g1',
      jid: '120@g.us',
      subject: null,
      description: null,
      size: 12,
      is_community: true,
      announce: false,
      restrict: true,
      synced_at: '2026-01-01T00:00:00Z',
    });
  });
});

describe('serializeWaParticipant', () => {
  it('marks in_crm from the caller flag', () => {
    const row = {
      id: 'p1',
      group_id: 'g1',
      jid: '1555@s.whatsapp.net',
      phone: '+1555',
      display_name: 'Ada',
      is_admin: true,
      is_super_admin: false,
    };
    expect(serializeWaParticipant(row, true).in_crm).toBe(true);
    expect(serializeWaParticipant(row, false).in_crm).toBe(false);
  });
});

describe('serializeContactGroup', () => {
  it('reads member_count from the embed when not passed', () => {
    expect(
      serializeContactGroup({
        id: 'cg1',
        name: 'miami-event-leads',
        description: null,
        color: '#6366f1',
        is_smart: false,
        smart_filter: null,
        created_at: 'a',
        updated_at: 'b',
        contact_group_members: [{ count: 4 }],
      }).member_count
    ).toBe(4);
  });
});

describe('parseContactIds', () => {
  it('returns null for missing or non-array contact_ids', () => {
    expect(parseContactIds(null)).toBeNull();
    expect(parseContactIds({})).toBeNull();
    expect(parseContactIds({ contact_ids: 'x' })).toBeNull();
  });

  it('keeps non-empty strings only', () => {
    expect(parseContactIds({ contact_ids: ['a', '', 2, 'b'] })).toEqual([
      'a',
      'b',
    ]);
  });
});
