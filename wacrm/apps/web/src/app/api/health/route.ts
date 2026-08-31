import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { BROADCASTS_CRON_KEY, readCronHeartbeat } from '@/lib/ops/heartbeat';

/**
 * Liveness probe for reverse proxies and Compose.
 * Cron heartbeat is best-effort so a missing table still returns ok.
 */
export async function GET() {
  let lastCronAt: string | null = null;
  let cronStale = false;
  try {
    const beat = await readCronHeartbeat(supabaseAdmin(), BROADCASTS_CRON_KEY);
    lastCronAt = beat?.last_ok_at ?? null;
    if (lastCronAt) {
      cronStale = Date.now() - new Date(lastCronAt).getTime() > 15 * 60 * 1000;
    }
  } catch {
    lastCronAt = null;
  }
  return NextResponse.json({
    ok: true,
    service: 'web',
    nodeEnv: process.env.NODE_ENV ?? 'unknown',
    last_cron_at: lastCronAt,
    cron_stale: cronStale,
  });
}
