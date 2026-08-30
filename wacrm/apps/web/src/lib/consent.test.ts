import { describe, expect, it } from 'vitest';
import { filterByEligibleIds, NO_CONSENT_MESSAGE } from './consent';
import { isValidLandingSlug, normalizeLandingSlug } from './landings';

describe('filterByEligibleIds', () => {
  it('drops opted_out and contacts without a consent id', () => {
    const eligible = new Set(['a']);
    const rows = [
      { id: 'a', opted_out: false },
      { id: 'b', opted_out: false },
      { id: 'c', opted_out: true },
    ];
    expect(filterByEligibleIds(rows, eligible).map((r) => r.id)).toEqual(['a']);
  });
});

describe('landing slug', () => {
  it('accepts lowercase hyphenated slugs', () => {
    expect(isValidLandingSlug('wellness-week')).toBe(true);
    expect(isValidLandingSlug('a')).toBe(true);
  });

  it('rejects spaces, uppercase, and leading hyphens', () => {
    expect(isValidLandingSlug(normalizeLandingSlug('Wellness Week'))).toBe(false);
    expect(isValidLandingSlug('-nope')).toBe(false);
    expect(isValidLandingSlug('Nope')).toBe(false);
  });
});

describe('NO_CONSENT_MESSAGE', () => {
  it('tells the operator to use a landing', () => {
    expect(NO_CONSENT_MESSAGE).toMatch(/landing/i);
  });
});
