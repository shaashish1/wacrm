import { NextResponse } from 'next/server';

/**
 * Liveness probe for reverse proxies and Compose.
 * Does not call Supabase or Redis — those have their own healthchecks.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'web',
    nodeEnv: process.env.NODE_ENV ?? 'unknown',
  });
}
