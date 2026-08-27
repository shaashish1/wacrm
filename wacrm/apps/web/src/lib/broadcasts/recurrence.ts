export type BroadcastRecurrence = 'daily' | 'weekly';

export function isBroadcastRecurrence(value: unknown): value is BroadcastRecurrence {
  return value === 'daily' || value === 'weekly';
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Next fire time after `fromIso`, stepping daily or weekly until it
 * is strictly in the future (so a missed cron window does not enqueue
 * a burst of catch-up clones).
 */
export function nextScheduledAt(
  fromIso: string,
  recurrence: BroadcastRecurrence,
  nowMs: number = Date.now(),
): string {
  const stepMs = recurrence === 'weekly' ? 7 * DAY_MS : DAY_MS;
  let t = new Date(fromIso).getTime();
  if (!Number.isFinite(t)) t = nowMs;
  do {
    t += stepMs;
  } while (t <= nowMs);
  return new Date(t).toISOString();
}
