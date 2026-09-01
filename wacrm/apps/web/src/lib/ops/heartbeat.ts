import type { SupabaseClient } from '@supabase/supabase-js';

export const BROADCASTS_CRON_KEY = 'broadcasts_cron';
export const WEBHOOKS_CRON_KEY = 'webhooks_cron';

export async function touchCronHeartbeat(
  db: SupabaseClient,
  key: string,
  processed: number,
  meta?: Record<string, unknown>,
): Promise<void> {
  const { error } = await db.from('ops_heartbeats').upsert(
    {
      key,
      last_ok_at: new Date().toISOString(),
      processed,
      meta: meta ?? null,
    },
    { onConflict: 'key' },
  );
  if (error) {
    console.warn(`[heartbeat] ${key} write failed:`, error.message);
  }
}

export async function readCronHeartbeat(
  db: SupabaseClient,
  key: string,
): Promise<{ last_ok_at: string; processed: number } | null> {
  const { data, error } = await db
    .from('ops_heartbeats')
    .select('last_ok_at, processed')
    .eq('key', key)
    .maybeSingle();
  if (error || !data) return null;
  return { last_ok_at: data.last_ok_at as string, processed: data.processed as number };
}
