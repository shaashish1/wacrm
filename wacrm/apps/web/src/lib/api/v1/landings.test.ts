import { describe, expect, it } from 'vitest';

import { hasScope } from '../../api-keys/scopes';
import {
  DEFAULT_CONSENT_COPY,
  DEFAULT_LANDING_BODY,
  DEFAULT_LANDING_HEADLINE,
  isValidLandingSlug,
} from '../../landings';

import {
  parseLandingCreate,
  parseLandingUpdate,
  serializeLanding,
} from './landings';

describe('landing scopes', () => {
  it('landings:write is distinct from landings:read', () => {
    expect(hasScope(['landings:read'], 'landings:write')).toBe(false);
    expect(hasScope(['landings:write'], 'landings:write')).toBe(true);
    expect(hasScope(['landings:read'], 'landings:read')).toBe(true);
  });
});

describe('serializeLanding', () => {
  it('nulls optional copy fields and defaults consent_copy', () => {
    expect(
      serializeLanding({
        id: 'l1',
        slug: 'wellness-week',
        title: 'Wellness week',
        headline: null,
        body: null,
        published: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: null,
      })
    ).toMatchObject({
      id: 'l1',
      slug: 'wellness-week',
      headline: null,
      body: null,
      consent_copy: DEFAULT_CONSENT_COPY,
      published: true,
    });
  });
});

describe('parseLandingCreate', () => {
  it('requires a valid slug and title', () => {
    expect(parseLandingCreate({ slug: 'Bad Slug', title: 'X' }).ok).toBe(false);
    expect(parseLandingCreate({ slug: 'ok-slug' }).ok).toBe(false);
  });

  it('fills clinic-safe defaults and stays unpublished unless asked', () => {
    const parsed = parseLandingCreate({
      slug: 'Wellness-Week',
      title: ' Wellness week ',
    });
    expect(parsed).toEqual({
      ok: true,
      value: {
        slug: 'wellness-week',
        title: 'Wellness week',
        headline: DEFAULT_LANDING_HEADLINE,
        body: DEFAULT_LANDING_BODY,
        consent_copy: DEFAULT_CONSENT_COPY,
        published: false,
      },
    });
    expect(isValidLandingSlug('wellness-week')).toBe(true);
  });
});

describe('parseLandingUpdate', () => {
  it('rejects empty patches and invalid slugs', () => {
    expect(parseLandingUpdate({}).ok).toBe(false);
    expect(parseLandingUpdate({ slug: 'bad slug!' }).ok).toBe(false);
  });

  it('accepts a published toggle', () => {
    expect(parseLandingUpdate({ published: true })).toEqual({
      ok: true,
      value: { published: true },
    });
  });
});
