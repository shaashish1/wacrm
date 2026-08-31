import { describe, expect, it } from 'vitest';
import { jitterToMs, normalizeJitterSeconds } from './jitter';

describe('normalizeJitterSeconds', () => {
  it('defaults to 1–3s and clamps inverted or huge windows', () => {
    expect(normalizeJitterSeconds(undefined, undefined)).toEqual({
      minSec: 1,
      maxSec: 3,
    });
    expect(normalizeJitterSeconds(5, 2)).toEqual({ minSec: 5, maxSec: 5 });
    expect(normalizeJitterSeconds(-1, 999)).toEqual({ minSec: 0, maxSec: 300 });
  });

  it('converts to ms for RateGovernor', () => {
    expect(jitterToMs({ minSec: 2, maxSec: 8 })).toEqual({
      jitterMinMs: 2000,
      jitterMaxMs: 8000,
    });
  });
});
