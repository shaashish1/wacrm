import { describe, expect, it } from 'vitest';

import { NO_CONSENT_MESSAGE } from '../../consent';
import { hasScope } from '../../api-keys/scopes';

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  campaignMarketingChannel,
  decideCampaignEnroll,
  decideCampaignResume,
  enrollRefused,
  parseCampaignCreate,
  parseCampaignSteps,
  parseCampaignUpdate,
  parseEnrollContactIds,
  resumeRefused,
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

describe('parseCampaignCreate / parseCampaignUpdate', () => {
  it('creates a draft and refuses status=active (no implied blast)', () => {
    const created = parseCampaignCreate({
      name: ' Wellness week ',
      channel: 'whatsapp',
      steps: [{ channel: 'whatsapp', delay_hours: 0 }],
    });
    expect(created).toMatchObject({
      ok: true,
      value: { name: 'Wellness week', channel: 'whatsapp' },
    });
    if (created.ok) {
      expect(created.value.steps).toHaveLength(1);
      expect(created.value).not.toHaveProperty('status');
    }

    const refused = parseCampaignCreate({ name: 'X', status: 'active' });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.message).toMatch(/draft/i);
  });

  it('refuses contact_ids on create and update so they cannot enroll the book', () => {
    expect(
      parseCampaignCreate({ name: 'X', contact_ids: ['c1'] }).ok
    ).toBe(false);
    expect(
      parseCampaignUpdate({ name: 'X', contact_ids: ['c1'] }).ok
    ).toBe(false);
  });

  it('refuses status on update — pause/resume are the lifecycle path', () => {
    const refused = parseCampaignUpdate({ status: 'active' });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.message).toMatch(/pause|resume/i);
  });

  it('parses a name-only update', () => {
    expect(parseCampaignUpdate({ name: ' New title ' })).toEqual({
      ok: true,
      value: { name: 'New title' },
    });
  });
});

describe('parseCampaignSteps', () => {
  it('returns null for a non-array', () => {
    expect(parseCampaignSteps('x')).toBeNull();
  });

  it('defaults channel to email and position from index', () => {
    expect(parseCampaignSteps([{ delay_hours: 12 }])).toEqual([
      {
        position: 1,
        channel: 'email',
        delay_hours: 12,
        email_template_id: null,
        whatsapp_template_name: null,
        exit_on_reply: true,
      },
    ]);
  });
});

describe('decideCampaignResume / resumeRefused', () => {
  it('returns only consented paused enrollments to the cron path', () => {
    expect(
      decideCampaignResume(['c-yes', 'c-no', 'c-yes'], new Set(['c-yes']))
    ).toEqual({
      toResume: ['c-yes'],
      skippedNoConsent: ['c-no'],
    });
  });

  it('refuses a paused campaign when nobody is eligible (imported book)', () => {
    const decision = decideCampaignResume(
      ['c-import-1', 'c-import-2'],
      new Set()
    );
    expect(resumeRefused('paused', decision, 2)).toBe(true);
    expect(decision.toResume).toEqual([]);
    expect(NO_CONSENT_MESSAGE).toMatch(/consent/i);
  });

  it('refuses a paused campaign with zero enrollments', () => {
    expect(
      resumeRefused('paused', { toResume: [], skippedNoConsent: [] }, 0)
    ).toBe(true);
  });

  it('does not refuse an already-active campaign with nothing paused', () => {
    expect(
      resumeRefused('active', { toResume: [], skippedNoConsent: [] }, 0)
    ).toBe(false);
  });
});

describe('resume does not send WhatsApp', () => {
  it('resumeCampaign only writes enrollment rows — no send import', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'campaigns.ts'),
      'utf8'
    );
    expect(src).toMatch(/export async function resumeCampaign/);
    expect(src).not.toMatch(
      /send-message|wwebjsMessageQueue|sendMessageToConversation|sendText/
    );
    expect(src).toMatch(/Does not send[\s\S]{0,20}WhatsApp/);
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
