import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { WEBHOOKS_CRON_KEY, touchCronHeartbeat } from '@/lib/ops/heartbeat';
import { drainWebhookDeliveries } from '@/lib/webhooks/deliver';

/**
 * Drain due outbound webhook deliveries (retry-with-backoff).
 *
 * Auth: Authorization: Bearer $CRON_SECRET
 * The worker also drains this table; this route is the web-side
 * fallback when the worker is down (same secret as broadcasts/cron).
 */
function authorize(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

async function handle(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 });
  }
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const result = await drainWebhookDeliveries(admin, 25);
  await touchCronHeartbeat(admin, WEBHOOKS_CRON_KEY, result.delivered + result.retried, {
    ...result,
  });
  return NextResponse.json({
    ...result,
    last_cron_at: new Date().toISOString(),
  });
}
