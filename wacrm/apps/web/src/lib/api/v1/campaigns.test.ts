import { describe, expect, it } from 'vitest';

import { NO_CONSENT_MESSAGE } from '../../consent';
import { hasScope } from '../../api-keys/scopes';

import {
  campaignMarketingChannel,
  decideCampaignEnroll,
  enrollRefused,
  parseEnrollContactIds,
  serializeCampaign,
  serializeCampaignStep,
  serializeEnrollment,
} from './campaigns';

describe('campaign scopes (enroll auth)', () => {
  it('campaigns:send is distinct from campaigns:read', () => {
    expect(hasScope(['campaigns:read'], 'campaigns:send')).toBe(false);
    expect(hasScope(['campaigns:send'], 'campaigns:send')).toBe(true);
    expect(hasScope(['campaigns:read'], 'campaigns:read')).toBe(true);
  });
});

describe('campaignMarketingChannel', () => {
  it('maps email and whatsapp directly', () => {
    expect(campaignMarketingChannel('email')).toBe('email');
    expect(campaignMarketingChannel('whatsapp')).toBe('whatsapp');
  });

  it('treats multi with a WhatsApp step as WhatsApp (blast-risk channel)', () => {
    expect(
      campaignMarketingChannel('multi', [
        { channel: 'email' },
        { channel: 'whatsapp' },
      ])
    ).toBe('whatsapp');
  });

  it('treats multi with only email steps as email', () => {
    expect(campaignMarketingChannel('multi', [{ channel: 'email' }])).toBe(
      'email'
    );
  });

  it('defaults multi with no steps to WhatsApp so the imported book cannot enroll', () => {
    expect(campaignMarketingChannel('multi')).toBe('whatsapp');
  });
});

describe('decideCampaignEnroll / enrollRefused', () => {
  const eligible = new Set(['c-yes']);
  const already = new Set(['c-already']);

  it('enrolls only consented contacts that are not already in', () => {
    expect(
      decideCampaignEnroll(
        ['c-yes', 'c-no', 'c-already', 'c-yes'],
        eligible,
        already
      )
    ).toEqual({
      toEnroll: ['c-yes'],
      skippedNoConsent: ['c-no'],
      alreadyEnrolled: ['c-already'],
    });
  });

  it('refuses when the imported book has no consent and nobody is enrolled', () => {
    const decision = decideCampaignEnroll(
      ['c-import-1', 'c-import-2'],
      new Set(),
      new Set()
    );
    expect(enrollRefused(decision)).toBe(true);
    expect(decision.toEnroll).toEqual([]);
    expect(decision.skippedNoConsent).toHaveLength(2);
    expect(NO_CONSENT_MESSAGE).toMatch(/consent/i);
  });

  it('does not refuse when everyone is already enrolled', () => {
    const decision = decideCampaignEnroll(
      ['c-already'],
      new Set(),
      new Set(['c-already'])
    );
    expect(enrollRefused(decision)).toBe(false);
    expect(decision.alreadyEnrolled).toEqual(['c-already']);
  });
});

describe('parseEnrollContactIds', () => {
  it('treats a missing contact_ids as enroll-from-audience', () => {
    expect(parseEnrollContactIds({})).toEqual([]);
    expect(parseEnrollContactIds(null)).toEqual([]);
  });

  it('returns null for a non-array contact_ids', () => {
    expect(parseEnrollContactIds({ contact_ids: 'x' })).toBeNull();
  });

  it('keeps non-empty strings only', () => {
    expect(parseEnrollContactIds({ contact_ids: ['a', '', 2, 'b'] })).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('serializeCampaign', () => {
  it('counts enrollments from the embed and optionally includes sorted steps', () => {
    const row = {
      id: 'camp-1',
      name: 'Wellness week',
      channel: 'whatsapp',
      status: 'draft',
      audience_type: 'group',
      audience_group_id: 'g1',
      trigger_type: 'manual',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: null,
      campaign_enrollments: [{ count: 3 }],
      campaign_steps: [
        { id: 's2', position: 2, channel: 'email', delay_hours: 24 },
        { id: 's1', position: 1, channel: 'whatsapp', delay_hours: 0 },
      ],
    };
    const listed = serializeCampaign(row);
    expect(listed.enrollment_count).toBe(3);
    expect(listed.step_count).toBe(2);
    expect(listed.steps).toBeUndefined();

    const detailed = serializeCampaign(row, { includeSteps: true });
    expect(detailed.steps?.map((s) => s.id)).toEqual(['s1', 's2']);
  });
});

describe('serializeCampaignStep / serializeEnrollment', () => {
  it('nulls optional template fields', () => {
    expect(
      serializeCampaignStep({
        id: 's1',
        position: 1,
        channel: 'whatsapp',
        delay_hours: 0,
      })
    ).toEqual({
      id: 's1',
      position: 1,
      channel: 'whatsapp',
      delay_hours: 0,
      email_template_id: null,
      whatsapp_template_name: null,
      exit_on_reply: true,
    });
  });

  it('serializes an enrollment row', () => {
    expect(
      serializeEnrollment({
        id: 'e1',
        campaign_id: 'camp-1',
        contact_id: 'c1',
        current_step: 1,
        status: 'active',
        next_send_at: '2026-01-02T00:00:00Z',
        enrolled_at: '2026-01-01T00:00:00Z',
        completed_at: null,
      })
    ).toMatchObject({
      id: 'e1',
      contact_id: 'c1',
      status: 'active',
      completed_at: null,
    });
  });
});
