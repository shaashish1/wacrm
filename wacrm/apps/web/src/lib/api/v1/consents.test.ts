import { describe, expect, it } from 'vitest';

import { serializeConsent } from './consents';

describe('serializeConsent', () => {
  it('nulls optional fields and keeps channel/source', () => {
    expect(
      serializeConsent({
        id: 'c1',
        contact_id: 'ct1',
        phone_normalized: '+15551234567',
        channel: 'whatsapp',
        source: 'landing',
        granted_at: '2026-01-01T00:00:00Z',
        revoked_at: null,
        consent_text: 'I agree to WhatsApp updates',
        created_at: '2026-01-01T00:00:00Z',
      })
    ).toEqual({
      id: 'c1',
      contact_id: 'ct1',
      phone_normalized: '+15551234567',
      channel: 'whatsapp',
      source: 'landing',
      granted_at: '2026-01-01T00:00:00Z',
      revoked_at: null,
      consent_text: 'I agree to WhatsApp updates',
      created_at: '2026-01-01T00:00:00Z',
    });
  });
});
