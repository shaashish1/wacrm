import { describe, expect, it } from 'vitest';
import { isOptOutText } from './opt-out';

describe('isOptOutText', () => {
  it('matches STOP / UNSUBSCRIBE and Meta extras', () => {
    expect(isOptOutText('STOP')).toBe(true);
    expect(isOptOutText('unsubscribe please')).toBe(true);
    expect(isOptOutText('END')).toBe(true);
    expect(isOptOutText('QUIT')).toBe(true);
    expect(isOptOutText('CANCEL')).toBe(true);
  });

  it('does not treat conversational text as opt-out', () => {
    expect(isOptOutText('please stop by the office')).toBe(false);
    expect(isOptOutText('hello')).toBe(false);
    expect(isOptOutText('')).toBe(false);
  });
});
