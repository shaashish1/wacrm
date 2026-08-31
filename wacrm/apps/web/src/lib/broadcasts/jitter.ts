/** Default Baileys broadcast delay after warming (seconds). */
export const DEFAULT_JITTER_MIN_SEC = 1;
export const DEFAULT_JITTER_MAX_SEC = 3;
export const MAX_JITTER_SEC = 300;

export interface JitterSeconds {
  minSec: number;
  maxSec: number;
}

export function normalizeJitterSeconds(
  minSec?: number | null,
  maxSec?: number | null,
): JitterSeconds {
  const rawMin = Number(minSec);
  const rawMax = Number(maxSec);
  let min = Number.isFinite(rawMin) ? rawMin : DEFAULT_JITTER_MIN_SEC;
  let max = Number.isFinite(rawMax) ? rawMax : DEFAULT_JITTER_MAX_SEC;
  min = Math.max(0, Math.min(MAX_JITTER_SEC, Math.round(min)));
  max = Math.max(0, Math.min(MAX_JITTER_SEC, Math.round(max)));
  if (max < min) max = min;
  return { minSec: min, maxSec: max };
}

export function jitterToMs(j: JitterSeconds): { jitterMinMs: number; jitterMaxMs: number } {
  return { jitterMinMs: j.minSec * 1000, jitterMaxMs: j.maxSec * 1000 };
}
