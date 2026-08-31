import { createClient } from '@supabase/supabase-js';

const DEFAULT_MIN_MS = 1000;
const DEFAULT_MAX_MS = 3000;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

export function jitterFromPayload(payload: Record<string, unknown> | undefined): {
  jitterMinMs: number;
  jitterMaxMs: number;
} | null {
  const options = (payload?.options ?? {}) as {
    jitterMinMs?: unknown;
    jitterMaxMs?: unknown;
  };
  const min = Number(options.jitterMinMs);
  const max = Number(options.jitterMaxMs);
  if (Number.isFinite(min) && Number.isFinite(max) && max >= min && min >= 0) {
    return { jitterMinMs: min, jitterMaxMs: max };
  }
  return null;
}

export async function resolveBroadcastJitter(
  accountId: string,
  payload?: Record<string, unknown>,
): Promise<{ jitterMinMs: number; jitterMaxMs: number }> {
  const fromPayload = jitterFromPayload(payload);
  if (fromPayload) return fromPayload;

  const { data } = await supabase
    .from('accounts')
    .select('broadcast_jitter_min_sec, broadcast_jitter_max_sec')
    .eq('id', accountId)
    .maybeSingle();

  const minSec = Number(data?.broadcast_jitter_min_sec);
  const maxSec = Number(data?.broadcast_jitter_max_sec);
  if (Number.isFinite(minSec) && Number.isFinite(maxSec) && maxSec >= minSec && minSec >= 0) {
    return { jitterMinMs: minSec * 1000, jitterMaxMs: maxSec * 1000 };
  }
  return { jitterMinMs: DEFAULT_MIN_MS, jitterMaxMs: DEFAULT_MAX_MS };
}
