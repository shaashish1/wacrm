-- Migration 059: Configurable Baileys broadcast jitter + cron heartbeat.
-- US-2: persist min/max seconds on the broadcast and as account defaults.
-- US-3: ops_heartbeats.last_ok_at so operators can see cron is alive.

ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS jitter_min_sec INTEGER,
  ADD COLUMN IF NOT EXISTS jitter_max_sec INTEGER;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS broadcast_jitter_min_sec INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS broadcast_jitter_max_sec INTEGER NOT NULL DEFAULT 3;

ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_broadcast_jitter_range;
ALTER TABLE accounts
  ADD CONSTRAINT accounts_broadcast_jitter_range
  CHECK (
    broadcast_jitter_min_sec >= 0
    AND broadcast_jitter_max_sec >= broadcast_jitter_min_sec
    AND broadcast_jitter_max_sec <= 300
  );

ALTER TABLE broadcasts
  DROP CONSTRAINT IF EXISTS broadcasts_jitter_range;
ALTER TABLE broadcasts
  ADD CONSTRAINT broadcasts_jitter_range
  CHECK (
    jitter_min_sec IS NULL
    OR (
      jitter_min_sec >= 0
      AND jitter_max_sec IS NOT NULL
      AND jitter_max_sec >= jitter_min_sec
      AND jitter_max_sec <= 300
    )
  );

CREATE TABLE IF NOT EXISTS ops_heartbeats (
  key TEXT PRIMARY KEY,
  last_ok_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed INTEGER NOT NULL DEFAULT 0,
  meta JSONB
);

ALTER TABLE ops_heartbeats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ops_heartbeats_select ON ops_heartbeats;
CREATE POLICY ops_heartbeats_select ON ops_heartbeats FOR SELECT
  USING (true);

GRANT SELECT ON public.ops_heartbeats TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ops_heartbeats TO service_role;
