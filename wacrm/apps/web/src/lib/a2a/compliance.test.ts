import { describe, expect, it } from 'vitest';
import { reviewCopy } from './compliance';

describe('reviewCopy', () => {
  it('allows generic marketing with STOP', () => {
    const result = reviewCopy(
      'Join our wellness-week intro consult. Reply STOP to opt out.',
    );
    expect(result.allow).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('hard-blocks PHI even with STOP', () => {
    const result = reviewCopy('Your lab results are ready. Reply STOP');
    expect(result.allow).toBe(false);
    expect(result.violations).toContain('diagnosis');
  });

  it('notes a missing STOP footer without treating it as PHI', () => {
    const result = reviewCopy('Come tour the clinic this week.');
    expect(result.allow).toBe(true);
    expect(result.violations).toContain('missing_stop_footer');
  });
});
